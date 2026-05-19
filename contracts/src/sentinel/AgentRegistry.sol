// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title AgentRegistry
/// @notice Permissionless registry of Sentinel-network agents. An agent is an
///         operator-controlled participant in one of the four specialized
///         roles: Watcher, Scorer, Router, or Executor.
/// @dev Registration is open by design — the network filters bad actors via
///      reputation rather than gatekeeping. Each registration mints a unique
///      ID; the same operator may register multiple agents with different
///      roles. Only the operator that registered an agent may modify it.
contract AgentRegistry {
    enum Role {
        None,
        Watcher,
        Scorer,
        Router,
        Executor
    }

    struct Agent {
        uint256 id;
        address operator;
        Role role;
        string metadataURI;
        bool active;
        uint256 registeredAt;
    }

    /// @notice Auto-incrementing agent ID, starting at 1. ID 0 is reserved
    ///         to mean "not registered" in calling contracts.
    uint256 public nextAgentId = 1;

    mapping(uint256 agentId => Agent) private _agents;
    mapping(Role role => uint256[]) private _agentsByRole;

    event AgentRegistered(uint256 indexed agentId, address indexed operator, Role indexed role, string metadataURI);
    event AgentDeactivated(uint256 indexed agentId);
    event AgentReactivated(uint256 indexed agentId);
    event AgentMetadataUpdated(uint256 indexed agentId, string metadataURI);

    error AgentNotFound(uint256 agentId);
    error InvalidRole();
    error EmptyMetadata();
    error NotOperator(uint256 agentId, address caller);
    error AlreadyActive(uint256 agentId);
    error AlreadyInactive(uint256 agentId);

    function register(Role role, string calldata metadataURI) external returns (uint256 agentId) {
        if (role == Role.None) revert InvalidRole();
        if (bytes(metadataURI).length == 0) revert EmptyMetadata();

        agentId = nextAgentId++;
        _agents[agentId] = Agent({
            id: agentId,
            operator: msg.sender,
            role: role,
            metadataURI: metadataURI,
            active: true,
            registeredAt: block.timestamp
        });
        _agentsByRole[role].push(agentId);

        emit AgentRegistered(agentId, msg.sender, role, metadataURI);
    }

    function deactivate(uint256 agentId) external {
        Agent storage a = _existing(agentId);
        if (a.operator != msg.sender) revert NotOperator(agentId, msg.sender);
        if (!a.active) revert AlreadyInactive(agentId);
        a.active = false;
        emit AgentDeactivated(agentId);
    }

    function reactivate(uint256 agentId) external {
        Agent storage a = _existing(agentId);
        if (a.operator != msg.sender) revert NotOperator(agentId, msg.sender);
        if (a.active) revert AlreadyActive(agentId);
        a.active = true;
        emit AgentReactivated(agentId);
    }

    function updateMetadata(uint256 agentId, string calldata metadataURI) external {
        Agent storage a = _existing(agentId);
        if (a.operator != msg.sender) revert NotOperator(agentId, msg.sender);
        if (bytes(metadataURI).length == 0) revert EmptyMetadata();
        a.metadataURI = metadataURI;
        emit AgentMetadataUpdated(agentId, metadataURI);
    }

    /* --------------------------- View functions -------------------------- */

    function getAgent(uint256 agentId) external view returns (Agent memory) {
        return _existing(agentId);
    }

    function isActiveAgent(uint256 agentId, Role expectedRole) external view returns (bool) {
        Agent storage a = _agents[agentId];
        return a.id != 0 && a.active && a.role == expectedRole;
    }

    function operatorOf(uint256 agentId) external view returns (address) {
        return _existing(agentId).operator;
    }

    function agentsByRole(Role role) external view returns (uint256[] memory) {
        return _agentsByRole[role];
    }

    function agentCount(Role role) external view returns (uint256) {
        return _agentsByRole[role].length;
    }

    function _existing(uint256 agentId) private view returns (Agent storage a) {
        a = _agents[agentId];
        if (a.id == 0) revert AgentNotFound(agentId);
    }
}
