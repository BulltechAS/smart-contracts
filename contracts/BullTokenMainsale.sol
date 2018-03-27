pragma solidity 0.4.19;

import "./BullToken.sol";
import "./Whitelist.sol";
import "./zeppelin_overrides/CappedCrowdsale.sol";
import "./zeppelin_overrides/FinalizableCrowdsale.sol";

contract BullTokenMainsale is CappedCrowdsale, FinalizableCrowdsale {
  using SafeMath for uint256;

  Whitelist public whitelist;
  uint256 public minimumInvestment;
  uint256 public initialEndTime;
  uint256 public goal;
  uint256 public maxTokensOnDiscount;
  uint256 public tokensSold;
  bool public goalReachedBeforeInitialEndTime = false;

  mapping (uint256 => uint256) public dayNumberToBonusPercentage;

  function BullTokenMainsale(
    uint256 _startTime,
    uint256 _initialEndTime,
    uint256 _endTime,
    uint256 _rate,
    uint256 _goal,
    uint256 _cap,
    uint256 _maxTokensOnDiscount,
    uint256 _minimumInvestment,
    address _tokenAddress,
    address _wallet,
    address _whitelistAddress
  ) public
    CappedCrowdsale(_cap)
    FinalizableCrowdsale()
    BurnableCrowdsale(_startTime, _endTime, _rate, _wallet, _tokenAddress)
  {
    //As goal needs to be met for a successful crowdsale
    //the value needs to less or equal than a cap which is limit for accepted funds
    require(_goal <= _cap);

    whitelist = Whitelist(_whitelistAddress);
    minimumInvestment = _minimumInvestment;
    initialEndTime = _initialEndTime;
    goal = _goal;
    maxTokensOnDiscount = _maxTokensOnDiscount;

    dayNumberToBonusPercentage[1] = 30;
    dayNumberToBonusPercentage[2] = 15;
    dayNumberToBonusPercentage[3] = 10;
    dayNumberToBonusPercentage[4] = 5;
    dayNumberToBonusPercentage[5] = 5;
    dayNumberToBonusPercentage[6] = 5;
    dayNumberToBonusPercentage[7] = 5;
    dayNumberToBonusPercentage[8] = 5;
    dayNumberToBonusPercentage[9] = 5;
    dayNumberToBonusPercentage[10] = 5;
  }

  function createTokenContract() internal returns (BurnableToken) {
    return BullToken(tokenAddress);
  }

  // fallback function can be used to buy tokens
  function () external payable {
    buyTokens(msg.sender);
  }

  // low level token purchase function
  function buyTokens(address beneficiary) public payable {
    require(beneficiary != address(0));
    require(whitelist.isWhitelisted(beneficiary));

    uint256 weiAmount = msg.value;
    uint256 raisedIncludingThis = weiRaised.add(weiAmount);

    uint256 amountToBeRefunded = 0;

    require(hasStarted() && !hasEnded());

    if (raisedIncludingThis > cap) {
      amountToBeRefunded = raisedIncludingThis.sub(cap);
      weiAmount = cap.sub(weiRaised);
    } else {
      require(validPurchase());
    }

    uint256 tokens = calculateTokenAmount(weiAmount);
    uint256 tokensSoldAlready = token.totalSupply().sub(token.balanceOf(owner));
    uint256 tokensSoldIncludingThis = tokensSoldAlready.add(tokens);

    if (tokensSoldIncludingThis > token.totalSupply()) {
      uint256 tokensToBeWithheld = tokensSoldIncludingThis.sub(token.totalSupply());
      amountToBeRefunded = tokensToBeWithheld.div(rate);
      weiAmount = weiAmount.sub(amountToBeRefunded);
      tokens = tokens.sub(tokensToBeWithheld);
    }

    weiRaised = weiRaised.add(weiAmount);
    tokensSold = tokensSold.add(tokens);

    if (goalReached() && !initialEndTimeReached()) {
      goalReachedBeforeInitialEndTime = true;
    }

    token.transferFrom(owner, beneficiary, tokens);
    TokenPurchase(msg.sender, beneficiary, weiAmount, tokens);
    forwardFundsToWallet(weiAmount);

    if (amountToBeRefunded > 0) {
      beneficiary.transfer(amountToBeRefunded);
    }
  }

  // overriding CappedCrowdsale#validPurchase to add minimum investment logic
  // @return true if investors can buy at the moment
  function validPurchase() internal view returns (bool) {
    return super.validPurchase() && aboveMinimumInvestment();
  }

  // overriding CappedCrowdsale#hasEnded to add logic for possible endtime extension + running out of tokens
  // @return true if crowdsale has ended
  function hasEnded() public view returns (bool) {
    return (goalReachedBeforeInitialEndTime && initialEndTimeReached()) || super.hasEnded() || capReached() || outOfTokens();
  }

  function outOfTokens() public view returns (bool) {
    return token.balanceOf(owner).add(token.totalSupply()) < minimumInvestment.mul(rate).add(token.totalSupply());
  }

  function capReached() public view returns (bool) {
    return weiRaised.add(minimumInvestment) > cap;
  }

  function goalReached() public view returns (bool) {
    return weiRaised >= goal;
  }

  function initialEndTimeReached() public view returns (bool) {
    return now >= initialEndTime;
  }

  // @return true if crowdsale has ended
  function hasStarted() public view returns (bool) {
    return now >= startTime;
  }

  function aboveMinimumInvestment() internal view returns (bool) {
    return msg.value >= minimumInvestment;
  }

  function forwardFundsToWallet(uint256 amount) internal {
    wallet.transfer(amount);
  }

  function getCurrentDayNumber() view public returns (uint256) {
    return ((now.sub(startTime)).div(1 days)).add(1);
  }

  function calculateTokenAmount(uint256 _weiAmount) view public returns (uint256) {
    uint256 dayNumber = getCurrentDayNumber();
    uint256 baseTokenAmount = _weiAmount.mul(rate);

    if (isABonusDay(dayNumber)) {
      uint256 percentageForDay = dayNumberToBonusPercentage[dayNumber];
      uint256 bonusTokenAmount = baseTokenAmount.mul(percentageForDay).div(100);
      if (tokensSold.add(baseTokenAmount).add(bonusTokenAmount) <= maxTokensOnDiscount) {
        return baseTokenAmount.add(bonusTokenAmount);
      }
    }

    return baseTokenAmount;
  }

  function isABonusDay(uint256 _dayNumber) internal view returns (bool) {
    return dayNumberToBonusPercentage[_dayNumber] != 0;
  }

}
