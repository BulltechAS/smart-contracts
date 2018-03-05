var BullTokenMainsale = artifacts.require("BullTokenMainsale");
var BullToken = artifacts.require("BullToken");
var Whitelist = artifacts.require("Whitelist");

module.exports = function (deployer, network, accounts) {
  const startTime = web3.eth.getBlock(web3.eth.blockNumber).timestamp + 120 // some seconds in the future
  const initialEndTime = startTime + (86400 * 5) // 5 days
  const endTime = startTime + (86400 * 20) // 20 days
  // const startTime = 1522756800; // 12:00PM Tuesday, Apr. 3rd, 2018 UTC
  // const initialEndTime = 1526731200; // 12:00PM Saturday, May 19th, 2018 UTC
  // const endTime = 1542283200; // 12:00PM Thursday, Nov. 15th, 2018 UTC
  const rate = new web3.BigNumber(250);
  const minimumInvestment = new web3.BigNumber(web3.toWei("0.05", 'ether'));
  const goal = new web3.BigNumber(web3.toWei("500", "ether"));
  const cap = new web3.BigNumber(web3.toWei("204117", "ether"));
  const maxTokensOnDiscount = new web3.BigNumber(web3.toWei("3630000", "ether"));

  // With this, you will get an error complaining about the missing token
  // when you run truffle test, because this token lives on rinkeby. The tests will run, though.
  var presaleTokenAddress = process.env.PRESALE_TOKEN_ADDRESS;

  const wallet = accounts[0];

  deployer.then(async function () {
    await deployer.deploy(Whitelist);

    if (network == 'development') {
      await deployer.deploy(BullToken);
      presaleTokenAddress = BullToken.address;
    }

    await deployer.deploy(
      BullTokenMainsale,
      startTime,
      initialEndTime,
      endTime,
      rate,
      goal,
      cap,
      maxTokensOnDiscount,
      minimumInvestment,
      presaleTokenAddress,
      wallet,
      Whitelist.address
    );
  });

  deployer.then(function() {
    BullToken.at(presaleTokenAddress).then(function(instance) {
      instance.approve(BullTokenMainsale.address, rate.mul(cap));
    });
  });

};
