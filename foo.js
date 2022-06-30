it("picks a winner, resets, and sends money", async () => {
    const additionalEntrances = 3
    const startingIndex = 2
    const accounts = await ethers.getSigners()
    for (let i = startingIndex; i < startingIndex + additionalEntrances; i++) {
        raffle = raffle.connect(accounts[i])
        await raffle.enterRaffle({ value: raffleEntranceFee })
    }
    const startingTimeStamp = await raffle.getLatestTimeStamp()

    await new Promise(async (resolve, reject) => {
        raffle.once("WinnerPicked", async () => {
            console.log("WinnerPicked event fired!")
            try {
                const recentWinner = await raffle.getRecentWinner()
                const raffleState = await raffle.getRaffleState()
                const winnerBalance = await accounts[2].getBalance()
                const endingTimeStamp = await raffle.getLatestTimeStamp()
                await expect(raffle.getPlayer(0)).to.be.reverted
                assert.equal(recentWinner.toString(), accounts[2].address)
                assert.equal(raffleState, 0)
                assert.equal(
                    winnerBalance.toString(),
                    startingBalance
                        .add(
                            raffleEntranceFee
                                .mul(additionalEntrances)
                                .add(raffleEntranceFee)
                        )
                        .toString()
                )
                assert(endingTimeStamp > startingTimeStamp)
                resolve()
            } catch (e) {
                console.log(e)
                reject(e)
            }
        })

        const tx = await raffle.performUpkeep("0x")
        const txReceipt = await tx.wait(1)
        const startingBalance = await accounts[2].getBalance()
        await vrfCoordinatorV2Mock.fulfillRandomWords(
            txReceipt.events[1].args.requestId,
            raffle.address
        )
    })
})
            // it.only("picks a winner, resets the lottery, and sends money", async () => {
            //     const additionalEntrants = 3;
            //     const startingAccountIndex = 1; //deployer = 0
            //     const accounts = await ethers.getSigners();
            //     for (
            //         let i = startingAccountIndex;
            //         i < startingAccountIndex + additionalEntrants;
            //         i++
            //     ) {
            //         const accountConnectedRaffle = raffle.connect(accounts[i]);
            //         await accountConnectedRaffle.enterRaffle({
            //             value: raffleEntranceFee,
            //         });
            //     }
            //     const startingTimeStamp = await raffle.getLatestTimeSamp();

            //     //performUpkeep (mock being Chainlink keepers)
            //     //fulfillRandomWords (mock being Chainlink VRF)
            //     //We will have to wait for the fulfillRandomWords to be called
            //     await new Promise(async (resolve, reject) => {
            //         raffle.once("WinnerPicked", async () => {
            //             console.log("Found the event!");
            //             try {
            //                 const recentWinner = await raffle.getRecentWinner();
            //                 // console.log(recentWinner)
            //                 // console.log(accounts[0].address)
            //                 // console.log(accounts[1].address)
            //                 // console.log(accounts[2].address)
            //                 // console.log(accounts[3].address)
            //                 const raffleState = await raffle.getRaffleState();
            //                 const endingTimeStamp = await raffle.getLatestTimeSamp();
            //                 const numPlayers = await raffle.getNumberOfPlayers();
            //                 const winnerEndingBalance = await accounts[1].getBalance();
            //                 assert.equal(numPlayers.toString, "0");
            //                 assert.equal(raffleState.toString(), "0");
            //                 assert(endingTimeStamp > startingTimeStamp);

            //                 assert.equal(
            //                     winnerEndingBalance.toString(),
            //                     winnerStartingBalance
            //                         .add(raffleEntranceFee.mul(additionalEntrants))
            //                         .add(raffleEntranceFee.toString())
            //                 );
            //             } catch (e) {
            //                 reject(e);
            //             }
            //             resolve();
            //         });

            //         const tx = await raffle.performUpkeep([]);
            //         const txReceipt = await tx.wait(1);
            //         const winnerStartingBalance = await accounts[1].getBalance();

            //         await vrfCoordinatorV2Mock.fulfillRandomWords(
            //             txReceipt.events[1].args.requestId,
            //             raffle.address
            //         );
            //     });
            // });