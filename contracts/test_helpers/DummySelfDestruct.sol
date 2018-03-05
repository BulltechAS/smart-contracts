pragma solidity 0.4.19;

contract DummySelfDestruct {
  function () external payable {
  }

  function destruct(address receiver) public {
    selfdestruct(receiver);
  }
}
