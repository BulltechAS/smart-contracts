require('dotenv').load();
require('babel-register');
require('babel-polyfill');

var HDWalletProvider = require("truffle-hdwallet-provider");
var mnemonic = "turn error lift ready stem quality gate shed boring math merit uniform";

module.exports = {
  networks: {
    development: {
      host: "localhost",
      port: 8545,
      network_id: "*", // Match any network id
      // from: '0x1a478ecd7f5351c80710b599ac54de0bcc22819b'
    },

    bull: {
      host: "127.0.0.1",
      port: 8005,
      network_id: "671",
      gas: 6000000,
      from: process.env.BULL_ACCOUNT
    },

    ropsten: {
      network_id: 3,
      gas: 6000000,
      provider: function () {
        return new HDWalletProvider(mnemonic, "https://ropsten.infura.io/JyTsGbsVV0pNiwTvNbTP")
      },
    },

    rinkeby: {
      host: "localhost",
      port: 8545,
      network_id: 4,
      gas: 6721975,
      // from: process.env.RINKEBY_ACCOUNT
    },

    live: {
      network_id: 1,
      host: 'localhost',
      port: 8547,
      gas: 4700000,
      from: process.env.LIVE_ACCOUNT
    }
  }
};
