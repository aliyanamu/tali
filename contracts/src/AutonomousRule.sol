// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title AutonomousRule
/// @notice Stores user-authorized autonomous financial rules and attestations.
///         agentId references a Mantle-issued ERC-8004 identity NFT.
///         triggerHash = keccak256(abi.encode(tokenAddress, keccak256(direction), threshold))
///         actionHash  = keccak256(abi.encode(keccak256(actionType), targetPct, maxSlippageBps))
contract AutonomousRule {
    struct Rule {
        uint256 agentId;        // Mantle-issued ERC-8004 NFT token ID
        address owner;          // wallet that called setRule() — cryptographic consent
        bytes32 triggerHash;    // keccak256(abi.encode(tokenAddress, keccak256("IN"|"OUT"|"BOTH"), threshold))
        bytes32 actionHash;     // keccak256(abi.encode(keccak256("FARM"|"SWAP"|"DCA"), targetPct, maxSlippageBps))
        uint64  expiry;         // unix timestamp; 0 = never expires
        uint32  executionCount;
        bool    active;
    }

    uint256 private _nextRuleId = 1; // 0 reserved as "no rule" sentinel

    mapping(uint256 => Rule)      private _rules;
    mapping(address => uint256[]) private _ownerRules;
    mapping(bytes32 => bool)      private _attestedExecutions; // dedup guard keyed on executionHash

    event RuleSet(
        uint256 indexed ruleId,
        uint256 indexed agentId,
        address indexed owner,
        bytes32 triggerHash,
        bytes32 actionHash,
        uint64  expiry
    );
    event RuleDeactivated(uint256 indexed ruleId, address indexed owner);
    event RuleExecuted(
        uint256 indexed ruleId,
        bytes32 indexed executionHash, // indexed for efficient off-chain filtering (Goldsky/subgraph)
        uint32  executionCount,
        bytes32 solanaTxHash, // keccak256(toHex(solanaTxSignatureBase58)) — lookup reference, full sig in Postgres
        uint256 timestamp
    );

    function setRule(
        uint256 agentId,
        bytes32 triggerHash,
        bytes32 actionHash,
        uint64  expiry
    ) external returns (uint256 ruleId) {
        require(expiry == 0 || expiry > block.timestamp, "expiry must be future");
        // TODO: validate agentId against Mantle ERC-8004 registry in production
        ruleId = _nextRuleId++;
        _rules[ruleId] = Rule({
            agentId:        agentId,
            owner:          msg.sender,
            triggerHash:    triggerHash,
            actionHash:     actionHash,
            expiry:         expiry,
            executionCount: 0,
            active:         true
        });
        _ownerRules[msg.sender].push(ruleId);
        emit RuleSet(ruleId, agentId, msg.sender, triggerHash, actionHash, expiry);
    }

    function deactivateRule(uint256 ruleId) external {
        Rule storage rule = _rules[ruleId];
        require(rule.owner == msg.sender, "not owner");
        require(rule.active, "already inactive");
        rule.active = false;
        emit RuleDeactivated(ruleId, msg.sender);
    }

    /// @notice Permissionless for hackathon. Production: gate to registered agentWallet via ERC-8004.
    function attestExecution(
        uint256 ruleId,
        bytes32 executionHash,
        bytes32 solanaTxHash
    ) external {
        Rule storage rule = _rules[ruleId];
        require(rule.active, "rule not active");
        require(rule.expiry == 0 || rule.expiry > block.timestamp, "rule expired");
        require(!_attestedExecutions[executionHash], "already attested");
        _attestedExecutions[executionHash] = true;
        rule.executionCount++;
        emit RuleExecuted(ruleId, executionHash, rule.executionCount, solanaTxHash, block.timestamp);
    }

    /// @notice Returns true if rule exists, is active flag set, and has not expired.
    ///         Uses block.timestamp — Mantle validators may skew ±15s; use generous expiry windows.
    function isRuleActive(uint256 ruleId) external view returns (bool) {
        Rule storage rule = _rules[ruleId];
        return rule.active && (rule.expiry == 0 || rule.expiry > block.timestamp);
    }

    function getRule(uint256 ruleId) external view returns (Rule memory) {
        return _rules[ruleId];
    }

    /// @notice Returns all rule IDs ever created by owner (active + inactive).
    ///         Unbounded — safe for single-user hackathon; paginate before production scale.
    function getRulesByOwner(address owner) external view returns (uint256[] memory) {
        return _ownerRules[owner];
    }
}
