// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {AutonomousRule} from "../src/AutonomousRule.sol";

contract DeployAutonomousRule is Script {
    function run() external {
        vm.startBroadcast();
        AutonomousRule autonomousRule = new AutonomousRule();
        console.log("AutonomousRule deployed at:", address(autonomousRule));
        vm.stopBroadcast();
    }
}
