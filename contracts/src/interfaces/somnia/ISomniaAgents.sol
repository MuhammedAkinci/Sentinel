// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title ISomniaAgents
/// @notice Interface for the Somnia native agent invocation platform.
/// @dev Reference: https://docs.somnia.network/agents/invoking-agents/from-solidity
///      Mainnet (5031):  0x5E5205CF39E766118C01636bED000A54D93163E6
///      Testnet (50312): 0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776
///
///      Invocation is asynchronous: createRequest() returns a requestId, an elected
///      validator subcommittee executes the agent off-chain, validators submit
///      responses on-chain, and once consensus is reached the platform invokes the
///      requester's callbackSelector on callbackAddress with the consolidated result.
interface ISomniaAgents {
    /// @dev Mirrors the platform's response lifecycle.
    enum ResponseStatus {
        None,
        Pending,
        Success,
        Failed,
        TimedOut
    }

    enum ConsensusType {
        Majority,
        Threshold
    }

    struct Response {
        address validator;
        bytes result;
        ResponseStatus status;
        uint256 receipt;
        uint256 timestamp;
        uint256 executionCost;
    }

    struct Request {
        uint256 id;
        address requester;
        address callbackAddress;
        bytes4 callbackSelector;
        address[] subcommittee;
        Response[] responses;
        uint256 responseCount;
        uint256 failureCount;
        uint256 threshold;
        uint256 createdAt;
        uint256 deadline;
        ResponseStatus status;
        ConsensusType consensusType;
        uint256 remainingBudget;
        uint256 perAgentBudget;
    }

    event RequestCreated(
        uint256 indexed requestId,
        uint256 indexed agentId,
        uint256 perAgentBudget,
        bytes payload,
        address[] subcommittee
    );
    event RequestFinalized(uint256 indexed requestId, ResponseStatus status);
    event SubcommitteePaid(uint256 indexed requestId, uint256 totalPaid, uint256 perMember);
    event CommitteeDepositFailed(uint256 indexed requestId, uint256 attemptedAmount);

    /// @notice Submits a request to invoke the agent identified by `agentId`.
    /// @param agentId The on-chain agent identifier registered with the platform.
    /// @param callbackAddress Contract that will receive the consolidated response.
    /// @param callbackSelector 4-byte selector on `callbackAddress` to invoke on finalization.
    ///        Must accept (uint256 requestId, Response[] responses, ResponseStatus status, Request details).
    /// @param payload ABI-encoded agent-specific input.
    /// @return requestId Unique identifier for this request.
    function createRequest(
        uint256 agentId,
        address callbackAddress,
        bytes4 callbackSelector,
        bytes calldata payload
    ) external payable returns (uint256 requestId);

    /// @notice Variant of createRequest with explicit committee + consensus configuration.
    function createAdvancedRequest(
        uint256 agentId,
        address callbackAddress,
        bytes4 callbackSelector,
        bytes calldata payload,
        uint256 subcommitteeSize,
        uint256 threshold,
        ConsensusType consensusType,
        uint256 timeout
    )
        external
        payable
        returns (uint256 requestId);

    /// @notice Returns the minimum required deposit for a default-config request.
    function getRequestDeposit() external view returns (uint256);

    /// @notice Returns the minimum required deposit for an advanced request of given size.
    function getAdvancedRequestDeposit(uint256 subcommitteeSize) external view returns (uint256);

    function getRequest(uint256 requestId) external view returns (Request memory);

    function hasRequest(uint256 requestId) external view returns (bool);
}

/// @notice Callback interface that any contract invoked by SomniaAgents must implement.
/// @dev The callbackSelector passed to createRequest must match this signature.
interface ISomniaAgentCallback {
    function handleResponse(
        uint256 requestId,
        ISomniaAgents.Response[] memory responses,
        ISomniaAgents.ResponseStatus status,
        ISomniaAgents.Request memory details
    )
        external;
}
