// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {MockERC20} from "../src/MockERC20.sol";

// Deploy mock tokens defined in script/tokens.json.
// Tokens with a non-zero address are skipped (already deployed).
// After broadcasting, run `pnpm sync-token-addresses` to write deployed
// addresses back into tokens.json.
//
// Usage:
//   forge script script/DeployMockTokens.s.sol \
//     --rpc-url mantle_sepolia \
//     --private-key $DEPLOYER_PRIVATE_KEY \
//     --broadcast
contract DeployMockTokens is Script {
    struct TokenConfig {
        address addr;
        uint8 decimals;
        uint256 mintAmount;
        string name;
        string symbol;
    }

    function run() external {
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/script/tokens.json"));

        TokenConfig[] memory configs = abi.decode(
            vm.parseJson(json),
            (TokenConfig[])
        );

        vm.startBroadcast();
        for (uint256 i = 0; i < configs.length; i++) {
            TokenConfig memory cfg = configs[i];
            if (cfg.addr != address(0)) {
                console.log("skip", cfg.symbol, "(already deployed)");
                continue;
            }
            MockERC20 token = new MockERC20(cfg.name, cfg.symbol, cfg.decimals);
            if (cfg.mintAmount > 0) {
                token.mint(msg.sender, cfg.mintAmount);
            }
            console.log(cfg.symbol, "deployed at:", address(token));
        }
        vm.stopBroadcast();
    }
}
