const { assert, expect } = require("chai");
const { getNamedAccounts, deployments, ethers, network } = require("hardhat");
const {
    developmentChains,
    networkConfig,
} = require("../../helper-hardhat-config");

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle Unit Tests", () => {
        let raffle, deployer, vrfCoordinatorV2Mock, raffleEntranceFee, interval;

        const chainId = network.config.chainId;

        beforeEach(async () => {
            deployer = (await getNamedAccounts()).deployer;
            await deployments.fixture(["all"]);
            raffle = await ethers.getContract("Raffle", deployer);
            vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock");
            raffleEntranceFee = await raffle.getEntranceFee();
            interval = await raffle.getInterval();
        });

        describe("constructor", () => {
            ///initializes raffle correctly
            it("should initializes raffle correctly", async () => {
                const raffleState = await raffle.getRaffleState();
                const interval = await raffle.getInterval();

                assert.equal(raffleState.toString(), "0");
                assert.equal(interval.toString(), networkConfig[chainId]["interval"]);
            });
        });

        describe("enterRaffle", () => {
            it("reverts when you don't pay enough", async () => {
                await expect(raffle.enterRaffle()).to.be.revertedWith(
                    "Raffle__NotEnoughETHEntered"
                );
            });
        });

        it("records players when they enter", async () => {
            await raffle.enterRaffle({ value: raffleEntranceFee });
            const playerFromContract = await raffle.getPlayers(0);
            assert.equal(playerFromContract, deployer);
        });

        it("emits event on enter", async () => {
            await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.emit(
                raffle,
                "RaffleEnter"
            );
        });

        it("doesn't allow entrance when raffle is calculating", async () => {
            await raffle.enterRaffle({ value: raffleEntranceFee });
            await network.provider.send("evm_increaseTime", [
                interval.toNumber() + 1,
            ]);
            await network.provider.send("evm_mine", []);
            //Pretend to be a Chainlink Keeper
            await raffle.performUpkeep([]);
            await expect(
                raffle.enterRaffle({ value: raffleEntranceFee })
            ).to.be.revertedWith("Raffle__RaffleNotOpen");
        });

        describe("checkUpkeep", () => {
            it("returns false if people haven't sent any ETH", async () => {
                await network.provider.send("evm_increaseTime", [
                    interval.toNumber() + 1,
                ]);
                await network.provider.send("evm_mine", []);
                const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([]);
                assert(!upkeepNeeded);
            });

            it("return false if raffle isn't open", async () => {
                await raffle.enterRaffle({ value: raffleEntranceFee });
                await network.provider.send("evm_increaseTime", [
                    interval.toNumber() + 1,
                ]);
                await network.provider.send("evm_mine", []);
                await raffle.performUpkeep([]);
                const raffleState = await raffle.getRaffleState();
                const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([]);
                assert.equal(raffleState.toString(), "1");
                assert.equal(upkeepNeeded, false);
            });

            it("returns false if enough time hasn't passed", async function () {
                await raffle.enterRaffle({ value: raffleEntranceFee })
                await network.provider.send("evm_increaseTime", [interval.toNumber() - 1])
                await network.provider.send("evm_mine", [])
                const { upKeepNeeded } = await raffle.callStatic.checkUpkeep([])
                assert(!upKeepNeeded)
            })

            it("returns true if enough time has passed, has players, eth, and is open", async () => {
                await raffle.enterRaffle({ value: raffleEntranceFee });
                await network.provider.send("evm_increaseTime", [
                    interval.toNumber() + 1,
                ]);
                await network.provider.request({ method: "evm_mine", params: [] });
                const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x");
                assert(upkeepNeeded);
            });
        });

        describe("performUpkeep", () => {
            it("it can only run if checkupkeep is true", async () => {
                await raffle.enterRaffle({ value: raffleEntranceFee });
                await network.provider.send("evm_increaseTime", [
                    interval.toNumber() + 1,
                ]);
                await network.provider.send("evm_mine", []);
                const tx = await raffle.performUpkeep([]);
                assert(tx);
            });

            it("reverts when checkupkeep is false", async () => {
                await expect(raffle.performUpkeep([])).to.be.revertedWith(
                    "Raffle__UpkeepNotNeeded"
                );
            });

            it("updates the raffle state, emits and event, and calls the vrf coordinator", async () => {
                await raffle.enterRaffle({ value: raffleEntranceFee });
                await network.provider.send("evm_increaseTime", [
                    interval.toNumber() + 1,
                ]);
                await network.provider.send("evm_mine", []);
                const txResponse = await raffle.performUpkeep([]);
                const txReceipt = await txResponse.wait(1);
                const requestId = txReceipt.events[1].args.requestId;
                const raffleState = await raffle.getRaffleState();
                assert(requestId.toNumber() > 0);
                assert(raffleState.toString() == 1);
            });
        });

        describe("fulfillRandomWords", async () => {
            beforeEach(async () => {
                await raffle.enterRaffle({ value: raffleEntranceFee });
                await network.provider.send("evm_increaseTime", [
                    interval.toNumber() + 1,
                ]);
                await network.provider.send("evm_mine", []);
            });

            it("can only be called after performUpkeep", async () => {
                await expect(
                    vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address)
                ).to.be.revertedWith("nonexistent request");
                await expect(
                    vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.address)
                ).to.be.revertedWith("nonexistent request");
            });

            it("picks winner, resets the lottery, and sends money", async () => {
                const additionalEntrants = 3
                const startingAccountIndex = 1 //deployer = 0
                const accounts = await ethers.getSigners()
                for (let i = startingAccountIndex; i < startingAccountIndex + additionalEntrants; i++) {
                    const accountConnectedRaffle = raffle.connect(accounts[i])
                    await accountConnectedRaffle.enterRaffle({ value: raffleEntranceFee })
                }
                const startingTimeStamp = await raffle.getLatestTimeStamp()

                // performUpkeep (mock being chainlink keeper)
                // fulfillRandomWords (mock being the chanlink vrf)
                // We will have to wait for the fulfillRandomWords to be called

                await new Promise(async (resolve, reject) => {
                    raffle.once("WinnerPicked", async () => {
                        console.log("Found the event!")
                        try {
                            // const recentWinner = await raffle.getRecentWinner()
                            const raffleState = await raffle.getRaffleState()
                            const endingTimeStamp = await raffle.getLatestTimeStamp()
                            const numPlayers = await raffle.getNumberOfPlayers()
                            const winnerEndingBalance = await accounts[1].getBalance()
                            assert.equal(numPlayers.toString(), "0")
                            assert.equal(raffleState.toString(), "0")
                            assert(endingTimeStamp > startingTimeStamp)

                            assert.equal(winnerEndingBalance.toString(), winnnerStartingBalance.add(raffleEntranceFee.mul(additionalEntrants).add(raffleEntranceFee).toString()))
                        } catch (e) {
                            reject(e)
                        }

                        resolve()
                    })

                    const tx = await raffle.performUpkeep([])
                    const txReceipt = await tx.wait(1)
                    const winnnerStartingBalance = await accounts[1].getBalance()
                    await vrfCoordinatorV2Mock.fulfillRandomWords(txReceipt.events[1].args.requestId, raffle.address)
                })
            })


        });

    });





