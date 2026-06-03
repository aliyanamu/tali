// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {AutonomousRule} from "../src/AutonomousRule.sol";

contract AutonomousRuleTest is Test {
    AutonomousRule public ar;
    address public user     = address(0x1);
    address public stranger = address(0x2);

    // Redeclare events for vm.expectEmit matching
    event RuleSet(uint256 indexed ruleId, uint256 indexed agentId, address indexed owner, bytes32 triggerHash, bytes32 actionHash, uint64 expiry);
    event RuleDeactivated(uint256 indexed ruleId, address indexed owner);
    event RuleExecuted(uint256 indexed ruleId, uint32 executionCount, bytes32 executionHash, bytes32 solanaTxHash, uint256 timestamp);

    uint256 constant AGENT_ID = 1; // placeholder — replace with real Mantle-issued ID at mainnet deploy

    // Matches contract encoding: keccak256(abi.encode(tokenAddress, keccak256("IN"), uint256(0)))
    bytes32 constant TRIGGER_HASH = keccak256(abi.encode(
        address(0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE), // USDT Mantle Sepolia
        keccak256("IN"),
        uint256(0)
    ));

    // Matches contract encoding: keccak256(abi.encode(keccak256("FARM"), uint256(10), uint256(50)))
    bytes32 constant ACTION_HASH = keccak256(abi.encode(
        keccak256("FARM"),
        uint256(10),
        uint256(50)
    ));

    function setUp() public {
        ar = new AutonomousRule();
    }

    // T1: setRule happy path — stores rule, emits event, isRuleActive true
    function test_setRule_storesRuleAndEmitsEvent() public {
        vm.prank(user);
        vm.expectEmit(true, true, true, true);
        emit RuleSet(1, AGENT_ID, user, TRIGGER_HASH, ACTION_HASH, 0);
        uint256 ruleId = ar.setRule(AGENT_ID, TRIGGER_HASH, ACTION_HASH, 0);

        assertEq(ruleId, 1);
        assertTrue(ar.isRuleActive(ruleId));
        AutonomousRule.Rule memory r = ar.getRule(ruleId);
        assertEq(r.owner, user);
        assertEq(r.agentId, AGENT_ID);
        assertEq(r.triggerHash, TRIGGER_HASH);
        assertEq(r.actionHash, ACTION_HASH);
        assertEq(r.executionCount, 0);
        assertTrue(r.active);
    }

    // T2a: deactivateRule — owner succeeds, isRuleActive false after
    function test_deactivateRule_ownerSucceeds() public {
        vm.prank(user);
        uint256 ruleId = ar.setRule(AGENT_ID, TRIGGER_HASH, ACTION_HASH, 0);

        vm.prank(user);
        ar.deactivateRule(ruleId);

        assertFalse(ar.isRuleActive(ruleId));
        assertFalse(ar.getRule(ruleId).active);
    }

    // T2b: deactivateRule — stranger reverts
    function test_deactivateRule_strangerReverts() public {
        vm.prank(user);
        uint256 ruleId = ar.setRule(AGENT_ID, TRIGGER_HASH, ACTION_HASH, 0);

        vm.prank(stranger);
        vm.expectRevert("not owner");
        ar.deactivateRule(ruleId);
    }

    // T3: attestExecution — happy path, increments count
    function test_attestExecution_incrementsCount() public {
        vm.prank(user);
        uint256 ruleId = ar.setRule(AGENT_ID, TRIGGER_HASH, ACTION_HASH, 0);

        bytes32 execHash = keccak256("exec1");
        bytes32 solHash  = keccak256("solanaTxSig1");
        ar.attestExecution(ruleId, execHash, solHash);

        assertEq(ar.getRule(ruleId).executionCount, 1);
    }

    // T4: attestExecution on inactive rule reverts
    function test_attestExecution_inactiveRuleReverts() public {
        vm.prank(user);
        uint256 ruleId = ar.setRule(AGENT_ID, TRIGGER_HASH, ACTION_HASH, 0);

        vm.prank(user);
        ar.deactivateRule(ruleId);

        vm.expectRevert("rule not active");
        ar.attestExecution(ruleId, keccak256("exec"), keccak256("sol"));
    }

    // T5: expiry — isRuleActive false after timestamp passes
    function test_expiry_ruleBecomesInactive() public {
        uint64 expiry = uint64(block.timestamp + 100);
        vm.prank(user);
        uint256 ruleId = ar.setRule(AGENT_ID, TRIGGER_HASH, ACTION_HASH, expiry);

        assertTrue(ar.isRuleActive(ruleId));
        vm.warp(block.timestamp + 101);
        assertFalse(ar.isRuleActive(ruleId));
    }

    // T6: attestExecution on expired rule reverts
    function test_attestExecution_expiredRuleReverts() public {
        uint64 expiry = uint64(block.timestamp + 100);
        vm.prank(user);
        uint256 ruleId = ar.setRule(AGENT_ID, TRIGGER_HASH, ACTION_HASH, expiry);

        vm.warp(block.timestamp + 101);
        vm.expectRevert("rule expired");
        ar.attestExecution(ruleId, keccak256("exec"), keccak256("sol"));
    }

    // T7: duplicate attestation (same executionHash) reverts
    function test_attestExecution_duplicateReverts() public {
        vm.prank(user);
        uint256 ruleId = ar.setRule(AGENT_ID, TRIGGER_HASH, ACTION_HASH, 0);

        bytes32 execHash = keccak256("exec1");
        ar.attestExecution(ruleId, execHash, keccak256("sol1"));

        vm.expectRevert("already attested");
        ar.attestExecution(ruleId, execHash, keccak256("sol2"));
    }

    // T8: getRulesByOwner returns correct IDs for multiple rules
    function test_getRulesByOwner_multipleRules() public {
        vm.startPrank(user);
        uint256 id1 = ar.setRule(AGENT_ID, TRIGGER_HASH, ACTION_HASH, 0);
        uint256 id2 = ar.setRule(AGENT_ID, keccak256("other-trigger"), ACTION_HASH, 0);
        vm.stopPrank();

        uint256[] memory ids = ar.getRulesByOwner(user);
        assertEq(ids.length, 2);
        assertEq(ids[0], id1);
        assertEq(ids[1], id2);
    }

    // T9: setRule with past expiry reverts
    function test_setRule_pastExpiryReverts() public {
        vm.warp(1000);
        vm.prank(user);
        vm.expectRevert("expiry must be future");
        ar.setRule(AGENT_ID, TRIGGER_HASH, ACTION_HASH, uint64(999));
    }

    // T10: ruleId counter starts at 1
    function test_ruleId_startsAtOne() public {
        vm.prank(user);
        uint256 ruleId = ar.setRule(AGENT_ID, TRIGGER_HASH, ACTION_HASH, 0);
        assertEq(ruleId, 1);
    }
}
