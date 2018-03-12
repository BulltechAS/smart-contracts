import {increaseTimeTo} from "./helpers/increaseTime";

require('./helpers/spec_helper.js');

const BullToken = artifacts.require("./BullToken.sol");
const Whitelist = artifacts.require("./Whitelist.sol");
const BullTokenMainsale = artifacts.require("./BullTokenMainsale.sol");

// Insert
//eval(pry.it);
// anywhere in code to get debug breakpoint
// in console

contract('BullTokenMainsale', function([
                                         owner,
                                         wallet,
                                         purchaser,
                                         purchaser2,
                                         purchaser3
                                       ]) {

  const minimumInvestment = new BigNumber(web3.toWei("0.01", 'ether'));
  const goal = minimumInvestment.mul(10);
  const rate = new BigNumber(250);
  const cap = goal.mul(1.25);
  const maximumBonusTokens = minimumInvestment.mul(5).mul(rate);
  const validInvestment = minimumInvestment.add(new BigNumber(100000));
  const totalSupply = rate.mul(cap);
  const moreThanTxCost = new BigNumber(300000000000000000);

  let whitelist;
  let token;

  before(async function() {
    //Advance to the next block to correctly read time in the solidity "now" function interpreted by testrpc
    await advanceBlock();
  });

  beforeEach(async function() {
    this.startTime = latestTime() + duration.weeks(1);
    this.initialEndTime = this.startTime + duration.weeks(2);
    this.endTime = this.initialEndTime + duration.weeks(1);
    this.firstTimeWithNormalRates = this.startTime + duration.days(11);

    whitelist = await Whitelist.new({ from: owner });
    token = await BullToken.new({ from: owner });

    this.crowdsale = await BullTokenMainsale.new(
      this.startTime,
      this.initialEndTime,
      this.endTime,
      rate,
      goal,
      cap,
      maximumBonusTokens,
      minimumInvestment,
      token.address,
      wallet,
      whitelist.address,
      { from: owner }
    );

    let tokenSupply = await token.totalSupply();
    await token.approve(this.crowdsale.address, tokenSupply);

    await whitelist.addInvestor(owner, { from: owner });
    await whitelist.addInvestor(purchaser, { from: owner });
    await whitelist.addInvestor(purchaser2, { from: owner });
    await whitelist.addInvestor(purchaser3, { from: owner });
  });

  describe("crowdsale has NOT started", function() {

    it('should reject payments before start', async function() {
      try {
        await this.crowdsale.send(validInvestment);
        assert.fail();
      } catch (error) {
        assertRevert(error);
      }

      try {
        await this.crowdsale.buyTokens(purchaser, { from: purchaser, value: validInvestment });
        assert.fail();
      } catch (error) {
        assertRevert(error);
      }

      try {
        await this.crowdsale.sendTransaction({ from: purchaser, value: validInvestment });
        assert.fail();
      } catch (error) {
        assertRevert(error);
      }

    });
  });

  describe("crowdsale has started", function() {

    beforeEach(async function() {
      await increaseTimeTo(this.startTime);
    });

    it("increases weiRaised when tokens are bought", async function() {
      await this.crowdsale.sendTransaction({ from: owner, value: validInvestment });
      await this.crowdsale.sendTransaction({ from: purchaser, value: validInvestment });

      const weiRaised = await this.crowdsale.weiRaised();

      expect(weiRaised).to.bignumber.equal(validInvestment.mul(2));
    });

    it("does NOT let anyone transfer tokens if they are not the owner", async function() {
      await this.crowdsale.sendTransaction({ from: purchaser, value: validInvestment });
      try {
        await token.transfer(purchaser2, validInvestment, { from: purchaser });
        assert.fail();
      } catch (error) {
        assertRevert(error);
      }
    });

    it('does NOT allow anyone who is not the owner to finalize the crowdsale', async function() {
      try {
        await this.crowdsale.finalize({ from: purchaser });
        assert.fail();
      } catch (error) {
        assertRevert(error);
      }

      try {
        await this.crowdsale.finalize({ from: purchaser });
        assert.fail();
      } catch (error) {
        assertRevert(error);
      }
    });

    describe("bonus period is over", function() {

      beforeEach(async function() {
        await increaseTimeTo(this.firstTimeWithNormalRates);
      });

      it("increases token balance of investor with investment times rate after the bonus period", async function() {
        await this.crowdsale.sendTransaction({ from: purchaser, value: validInvestment });
        const balance = await token.balanceOf(purchaser);
        expect(balance).to.bignumber.equal(validInvestment.mul(rate));
      });

      it("decreases token balance of owner when someone buys tokens", async function() {
        const prevOwnerBalance = await token.balanceOf(owner);
        await this.crowdsale.sendTransaction({ from: purchaser, value: validInvestment });
        const ownerBalance = await token.balanceOf(owner);

        expect(ownerBalance.toNumber()).to.equal(prevOwnerBalance.toNumber() - (validInvestment.mul(rate)));
      });

      it("is possible to buy tokens from two different accounts", async function() {
        await this.crowdsale.sendTransaction({ from: purchaser, value: validInvestment });
        await this.crowdsale.sendTransaction({ from: purchaser2, value: validInvestment });

        const balance = await token.balanceOf(purchaser);
        const balance2 = await token.balanceOf(purchaser2);

        expect(balance).to.bignumber.equal(validInvestment.mul(rate));
        expect(balance2).to.bignumber.equal(validInvestment.mul(rate));
      });

    });

    describe("goal is reached before initial end time", function() {

      beforeEach(async function() {
        await increaseTimeTo(this.startTime);
        const moreThanGoal = goal.add(new BigNumber(100000));
        await this.crowdsale.sendTransaction({ from: purchaser, value: moreThanGoal });
      });

      it("does NOT end the crowdsale immediately", async function() {
        expect(await this.crowdsale.hasEnded()).to.equal(false);
      });

      it("the next buyer is allowed to buy tokens", async function() {
        await this.crowdsale.sendTransaction({ from: purchaser2, value: minimumInvestment });
      });

      it("ends the crowdsale at initialEndTime", async function() {
        await increaseTimeTo(this.initialEndTime);
        expect(await this.crowdsale.hasEnded()).to.equal(true);
      });
    });

    describe("goal is reached after initial end time", function() {
      it("does NOT end the crowdsale", async function() {
        await increaseTimeTo(this.initialEndTime);
        const moreThanGoal = goal.add(new BigNumber(100000));
        await this.crowdsale.sendTransaction({ from: purchaser, value: moreThanGoal });
        await this.crowdsale.sendTransaction({ from: purchaser2, value: minimumInvestment });
        expect(await this.crowdsale.hasEnded()).to.equal(false);
      });
    });

    describe("minimum investments", function() {

      it("accepts exact minimum investment", async function() {
        try {
          await this.crowdsale.sendTransaction({ from: purchaser, value: minimumInvestment });
        } catch (error) {
          assert.fail();
        }
      });

      it("does NOT accept less than the minimum investment", async function() {
        const tooSmallInvestment = minimumInvestment.sub(new BigNumber(1));
        try {
          await this.crowdsale.sendTransaction({ from: purchaser, value: tooSmallInvestment });
          assert.fail();
        } catch (error) {
          assertRevert(error);
        }
      });

      it("closes presale when remaining ETH until cap are fewer than what you get for a minimum investment", async function() {
        const halfOfMinimumInvestment = minimumInvestment.mul(0.5);
        const almostCap = cap.sub(halfOfMinimumInvestment);
        await this.crowdsale.sendTransaction({ from: purchaser, value: almostCap });

        expect(await this.crowdsale.hasEnded()).to.equal(true);
      });

    });

    describe("the last investment before ETH cap is reached", function() {

      describe("valid", function() {
        let purchasersOldEthBalance;

        beforeEach(async function() {
          const moreThanCap = cap.add(new BigNumber(100000));
          purchasersOldEthBalance = await web3.eth.getBalance(purchaser);

          await this.crowdsale.sendTransaction({ from: purchaser, value: moreThanCap });
        });

        it("ends the crowdsale", async function() {
          expect(await this.crowdsale.hasEnded()).to.equal(true);
        });

        it("set weiRaised to max", async function() {
          const weiRaised = await this.crowdsale.weiRaised();
          expect(weiRaised).to.bignumber.equal(cap);
        });

        it("returns overshooting amount to purchaser", async function() {
          const purchasersNewEthBalance = await web3.eth.getBalance(purchaser);
          let expectedNewBalance = purchasersOldEthBalance.sub(cap);

          // The below is done because a) Some wei will be deducted because of tx costs, and b) Mocha doesn't have a between matcher
          expect(purchasersNewEthBalance).to.bignumber.above(expectedNewBalance.sub(moreThanTxCost));
          expect(purchasersNewEthBalance).to.bignumber.below(expectedNewBalance.add(moreThanTxCost));
        });

        it("gives the purchaser the corresponding amount of tokens", async function() {
          const purchasersTokenBalance = await token.balanceOf(purchaser);
          expect(purchasersTokenBalance).to.bignumber.equal(totalSupply);
        });
      });

      describe("last investment is smaller than minimum investment", function() {

        beforeEach(async function() {
          const almostCap = cap.sub(new BigNumber(100000));
          await this.crowdsale.sendTransaction({ from: purchaser, value: almostCap });
        });

        it("rejects the investment", async function() {
          const lessThanMinimumInvestmentButCrossesCap = minimumInvestment.mul(0.5);
          try {
            await this.crowdsale.sendTransaction({ from: purchaser2, value: lessThanMinimumInvestmentButCrossesCap });
            assert.fail();
          } catch (error) {
            assertRevert(error);
          }
        });

      });
    });
  });

  async function expectTimeToTriggerBonus(pointInTime, bonusInPercent) {
    await increaseTimeTo(pointInTime);

    await this.crowdsale.sendTransaction({ from: purchaser, value: validInvestment });
    let balance = await token.balanceOf(purchaser);

    let expectedBaseTokens = validInvestment.mul(rate);
    let expectedBonusTokens = validInvestment.mul(rate).mul(bonusInPercent).div(100);
    expect(balance).to.bignumber.equal(expectedBaseTokens.add(expectedBonusTokens));
  }

  describe("bonuses", function() {

    it("gives 30% token bonus right after sale has started", async function() {
      let pointInTime = this.startTime;
      const bonusInPercent = 30;
      await expectTimeToTriggerBonus.call(this, pointInTime, bonusInPercent);
    });

    it("gives 30% token bonus one day minus 10 seconds after sale has started", async function() {
      let pointInTime = this.startTime + duration.days(1) - duration.seconds(10);
      const bonusInPercent = 30;
      await expectTimeToTriggerBonus.call(this, pointInTime, bonusInPercent);
    });

    it("gives 15% token bonus one day after sale has started", async function() {
      let pointInTime = this.startTime + duration.days(1);
      const bonusInPercent = 15;
      await expectTimeToTriggerBonus.call(this, pointInTime, bonusInPercent);
    });

    it("gives 10% token bonus two days after sale has started", async function() {
      let pointInTime = this.startTime + duration.days(2);
      const bonusInPercent = 10;
      await expectTimeToTriggerBonus.call(this, pointInTime, bonusInPercent);
    });

    it("gives 5% token bonus three days after sale has started", async function() {
      let pointInTime = this.startTime + duration.days(3);
      const bonusInPercent = 5;
      await expectTimeToTriggerBonus.call(this, pointInTime, bonusInPercent);
    });

    it("gives 5% token bonus four days after sale has started", async function() {
      let pointInTime = this.startTime + duration.days(4);
      const bonusInPercent = 5;
      await expectTimeToTriggerBonus.call(this, pointInTime, bonusInPercent);
    });

    it("gives 5% token bonus five days after sale has started", async function() {
      let pointInTime = this.startTime + duration.days(5);
      const bonusInPercent = 5;
      await expectTimeToTriggerBonus.call(this, pointInTime, bonusInPercent);
    });

    it("gives 5% token bonus six days after sale has started", async function() {
      let pointInTime = this.startTime + duration.days(6);
      const bonusInPercent = 5;
      await expectTimeToTriggerBonus.call(this, pointInTime, bonusInPercent);
    });

    it("gives 5% token bonus seven days after sale has started", async function() {
      let pointInTime = this.startTime + duration.days(7);
      const bonusInPercent = 5;
      await expectTimeToTriggerBonus.call(this, pointInTime, bonusInPercent);
    });

    it("gives 5% token bonus eight days after sale has started", async function() {
      let pointInTime = this.startTime + duration.days(8);
      const bonusInPercent = 5;
      await expectTimeToTriggerBonus.call(this, pointInTime, bonusInPercent);
    });

    it("gives 5% token bonus nine days after sale has started", async function() {
      let pointInTime = this.startTime + duration.days(9);
      const bonusInPercent = 5;
      await expectTimeToTriggerBonus.call(this, pointInTime, bonusInPercent);
    });

    it("gives no token bonus ten days after sale has started", async function() {
      let pointInTime = this.startTime + duration.days(10);
      const bonusInPercent = 0;
      await expectTimeToTriggerBonus.call(this, pointInTime, bonusInPercent);
    });

    it("gives no token bonus even after one day if the max bonus tokens have been sold out", async function() {
      let pointInTime = this.startTime + duration.seconds(1);
      await increaseTimeTo(pointInTime);

      let priceForBuyingAllBonusTokens = maximumBonusTokens.div(rate);
      await this.crowdsale.sendTransaction({ from: purchaser2, value: priceForBuyingAllBonusTokens });

      const bonusInPercent = 0;
      await expectTimeToTriggerBonus.call(this, pointInTime, bonusInPercent);
    });

  });

  describe("when crowdsale has passed the endTime", function() {

    beforeEach(async function() {
      await increaseTimeTo(this.endTime + duration.seconds(1));
    });

    it('rejects payments', async function() {
      try {
        await this.crowdsale.send(validInvestment);
        assert.fail();
      } catch (error) {
        assertRevert(error);
      }

      try {
        await this.crowdsale.buyTokens(purchaser, { from: purchaser, value: validInvestment });
        assert.fail();
      } catch (error) {
        assertRevert(error);
      }

      try {
        await this.crowdsale.sendTransaction({ from: purchaser, value: validInvestment });
        assert.fail();
      } catch (error) {
        assertRevert(error);
      }
    });

    it('has ended', async function() {
      expect(await this.crowdsale.hasEnded()).to.equal(true);
    });

  });

  describe("selling out tokens", function() {

    let newCrowdsale;
    let amountNeededToBuyAllTokens = new BigNumber(web3.toWei("1", 'ether'));

    beforeEach(async function() {
      // Creates new crowdsale for this special case in order to set rate to 1 ETH for all the tokens
      let total = await token.INITIAL_SUPPLY();

      const lowRate = new BigNumber(total);
      let cap = new BigNumber(amountNeededToBuyAllTokens.mul(2)); // Must be higher than number of tokens

      newCrowdsale = await BullTokenMainsale.new(
        this.startTime,
        this.initialEndTime,
        this.endTime,
        lowRate,
        goal,
        cap,
        maximumBonusTokens,
        minimumInvestment,
        token.address,
        wallet,
        whitelist.address,
        { from: owner }
      );

      let totalSupply = await token.totalSupply();
      await token.approve(newCrowdsale.address, totalSupply);

      await increaseTimeTo(this.endTime - duration.days(1));
    });

    describe("the last investment before tokens are gone", function() {

      let purchasersOldEthBalance;

      beforeEach(async function() {
        let investment = amountNeededToBuyAllTokens.add(minimumInvestment);
        purchasersOldEthBalance = await web3.eth.getBalance(purchaser);
        await newCrowdsale.sendTransaction({ from: purchaser, value: investment });
      });

      it("returns overshooting amount to purchaser", async function() {
        const purchasersNewEthBalance = await web3.eth.getBalance(purchaser);
        let expectedNewBalance = purchasersOldEthBalance.sub(amountNeededToBuyAllTokens);

        // The below is done because a) Some wei will be deducted because of tx costs, and b) Mocha doesn't have a between matcher
        expect(purchasersNewEthBalance).to.bignumber.above(expectedNewBalance.sub(moreThanTxCost));
        expect(purchasersNewEthBalance).to.bignumber.below(expectedNewBalance.add(moreThanTxCost));
      });

      it("gives the purchaser the corresponding amount of tokens", async function() {
        const purchasersTokenBalance = await token.balanceOf(purchaser);
        const allTokens = await token.totalSupply();
        expect(purchasersTokenBalance).to.bignumber.equal(allTokens);
      });

    });

    describe("when all tokens are sold, regardless of that cap is not reached", function() {

      beforeEach(async function() {
        await newCrowdsale.sendTransaction({ from: purchaser, value: amountNeededToBuyAllTokens });
      });

      it('rejects payments', async function() {
        try {
          await newCrowdsale.send(validInvestment);
          assert.fail();
        } catch (error) {
          assertRevert(error);
        }

        try {
          await newCrowdsale.buyTokens(purchaser, { from: purchaser, value: validInvestment });
          assert.fail();
        } catch (error) {
          assertRevert(error);
        }

        try {
          await newCrowdsale.sendTransaction({ from: purchaser, value: validInvestment });
          assert.fail();
        } catch (error) {
          assertRevert(error);
        }

      });

      it('has ended', async function() {
        expect(await newCrowdsale.hasEnded()).to.equal(true);
      });
    });

  });
});
