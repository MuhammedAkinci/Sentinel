// Auto-generated from contracts/out by scripts/sync-abis.py.
// Edit the Solidity source then run the script - do not hand-edit.

import type { Abi } from "viem";

export const coordinatorAbi: Abi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "owner_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "somniaAgents_",
        "type": "address",
        "internalType": "contract ISomniaAgents"
      },
      {
        "name": "lendingPool_",
        "type": "address",
        "internalType": "contract ILendingPool"
      },
      {
        "name": "registry_",
        "type": "address",
        "internalType": "contract AgentRegistry"
      },
      {
        "name": "reputation_",
        "type": "address",
        "internalType": "contract Reputation"
      },
      {
        "name": "splitter_",
        "type": "address",
        "internalType": "contract Splitter"
      },
      {
        "name": "scoreThreshold_",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "perRequestDeposit_",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "receive",
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "acceptOwnership",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "advanceToRouter",
    "inputs": [
      {
        "name": "caseId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "routerPayload",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "execute",
    "inputs": [
      {
        "name": "caseId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "executorAgentId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "flagPosition",
    "inputs": [
      {
        "name": "watcherAgentId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "user",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "collateralAsset",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "debtAsset",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "scorerPayload",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [
      {
        "name": "caseId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getCase",
    "inputs": [
      {
        "name": "caseId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct Coordinator.Case",
        "components": [
          {
            "name": "id",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "user",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "collateralAsset",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "debtAsset",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "watcherAgentId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "scorerAgentId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "routerAgentId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "executorAgentId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "scoreRequestId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "routeRequestId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "score",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "route",
            "type": "tuple",
            "internalType": "struct Coordinator.LiquidationRoute",
            "components": [
              {
                "name": "collateralAsset",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "debtAsset",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "debtToCover",
                "type": "uint256",
                "internalType": "uint256"
              }
            ]
          },
          {
            "name": "status",
            "type": "uint8",
            "internalType": "enum Coordinator.CaseStatus"
          },
          {
            "name": "createdAt",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "collateralSeized",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "handleRouterResponse",
    "inputs": [
      {
        "name": "requestId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "responses",
        "type": "tuple[]",
        "internalType": "struct ISomniaAgents.Response[]",
        "components": [
          {
            "name": "validator",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "result",
            "type": "bytes",
            "internalType": "bytes"
          },
          {
            "name": "status",
            "type": "uint8",
            "internalType": "enum ISomniaAgents.ResponseStatus"
          },
          {
            "name": "receipt",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "timestamp",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "executionCost",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      },
      {
        "name": "status",
        "type": "uint8",
        "internalType": "enum ISomniaAgents.ResponseStatus"
      },
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct ISomniaAgents.Request",
        "components": [
          {
            "name": "id",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "requester",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "callbackAddress",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "callbackSelector",
            "type": "bytes4",
            "internalType": "bytes4"
          },
          {
            "name": "subcommittee",
            "type": "address[]",
            "internalType": "address[]"
          },
          {
            "name": "responses",
            "type": "tuple[]",
            "internalType": "struct ISomniaAgents.Response[]",
            "components": [
              {
                "name": "validator",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "result",
                "type": "bytes",
                "internalType": "bytes"
              },
              {
                "name": "status",
                "type": "uint8",
                "internalType": "enum ISomniaAgents.ResponseStatus"
              },
              {
                "name": "receipt",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "timestamp",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "executionCost",
                "type": "uint256",
                "internalType": "uint256"
              }
            ]
          },
          {
            "name": "responseCount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "failureCount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "threshold",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "createdAt",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "deadline",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "status",
            "type": "uint8",
            "internalType": "enum ISomniaAgents.ResponseStatus"
          },
          {
            "name": "consensusType",
            "type": "uint8",
            "internalType": "enum ISomniaAgents.ConsensusType"
          },
          {
            "name": "remainingBudget",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "perAgentBudget",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "handleScorerResponse",
    "inputs": [
      {
        "name": "requestId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "responses",
        "type": "tuple[]",
        "internalType": "struct ISomniaAgents.Response[]",
        "components": [
          {
            "name": "validator",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "result",
            "type": "bytes",
            "internalType": "bytes"
          },
          {
            "name": "status",
            "type": "uint8",
            "internalType": "enum ISomniaAgents.ResponseStatus"
          },
          {
            "name": "receipt",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "timestamp",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "executionCost",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      },
      {
        "name": "status",
        "type": "uint8",
        "internalType": "enum ISomniaAgents.ResponseStatus"
      },
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct ISomniaAgents.Request",
        "components": [
          {
            "name": "id",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "requester",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "callbackAddress",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "callbackSelector",
            "type": "bytes4",
            "internalType": "bytes4"
          },
          {
            "name": "subcommittee",
            "type": "address[]",
            "internalType": "address[]"
          },
          {
            "name": "responses",
            "type": "tuple[]",
            "internalType": "struct ISomniaAgents.Response[]",
            "components": [
              {
                "name": "validator",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "result",
                "type": "bytes",
                "internalType": "bytes"
              },
              {
                "name": "status",
                "type": "uint8",
                "internalType": "enum ISomniaAgents.ResponseStatus"
              },
              {
                "name": "receipt",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "timestamp",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "executionCost",
                "type": "uint256",
                "internalType": "uint256"
              }
            ]
          },
          {
            "name": "responseCount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "failureCount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "threshold",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "createdAt",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "deadline",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "status",
            "type": "uint8",
            "internalType": "enum ISomniaAgents.ResponseStatus"
          },
          {
            "name": "consensusType",
            "type": "uint8",
            "internalType": "enum ISomniaAgents.ConsensusType"
          },
          {
            "name": "remainingBudget",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "perAgentBudget",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "lendingPool",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract ILendingPool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "nextCaseId",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "owner",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "pendingOwner",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "perRequestDeposit",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "registry",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract AgentRegistry"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "renounceOwnership",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "reputation",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract Reputation"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "requestToCase",
    "inputs": [
      {
        "name": "requestId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "caseId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "routerSentinelAgentId",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "routerSomniaAgentId",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "scoreThreshold",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "scorerSentinelAgentId",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "scorerSomniaAgentId",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "setPerRequestDeposit",
    "inputs": [
      {
        "name": "newDeposit",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setRouterSentinelAgentId",
    "inputs": [
      {
        "name": "newId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setRouterSomniaAgentId",
    "inputs": [
      {
        "name": "newId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setScoreThreshold",
    "inputs": [
      {
        "name": "newThreshold",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setScorerSentinelAgentId",
    "inputs": [
      {
        "name": "newId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setScorerSomniaAgentId",
    "inputs": [
      {
        "name": "newId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "somniaAgents",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract ISomniaAgents"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "splitter",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract Splitter"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "transferOwnership",
    "inputs": [
      {
        "name": "newOwner",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "withdrawERC20",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "contract IERC20"
      },
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "withdrawNative",
    "inputs": [
      {
        "name": "to",
        "type": "address",
        "internalType": "address payable"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "CaseCancelled",
    "inputs": [
      {
        "name": "caseId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "reason",
        "type": "bytes",
        "indexed": false,
        "internalType": "bytes"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Executed",
    "inputs": [
      {
        "name": "caseId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "executorAgentId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "debtCovered",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "collateralSeized",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "NativeReceived",
    "inputs": [
      {
        "name": "from",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "NativeWithdrawn",
    "inputs": [
      {
        "name": "to",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OwnershipTransferStarted",
    "inputs": [
      {
        "name": "previousOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "newOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OwnershipTransferred",
    "inputs": [
      {
        "name": "previousOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "newOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PerRequestDepositUpdated",
    "inputs": [
      {
        "name": "previous",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "current",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PositionFlagged",
    "inputs": [
      {
        "name": "caseId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "user",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "watcherAgentId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "scoreRequestId",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Routed",
    "inputs": [
      {
        "name": "caseId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "collateralAsset",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "debtAsset",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "debtToCover",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RouterAdvanced",
    "inputs": [
      {
        "name": "caseId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "routeRequestId",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RouterSentinelAgentIdUpdated",
    "inputs": [
      {
        "name": "previous",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "current",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RouterSomniaAgentIdUpdated",
    "inputs": [
      {
        "name": "previous",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "current",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ScoreThresholdUpdated",
    "inputs": [
      {
        "name": "previous",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "current",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Scored",
    "inputs": [
      {
        "name": "caseId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "score",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ScorerSentinelAgentIdUpdated",
    "inputs": [
      {
        "name": "previous",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "current",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ScorerSomniaAgentIdUpdated",
    "inputs": [
      {
        "name": "previous",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "current",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "AgentNotActive",
    "inputs": [
      {
        "name": "agentId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "AgentNotOwnedByCaller",
    "inputs": [
      {
        "name": "agentId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "AgentRoleMismatch",
    "inputs": [
      {
        "name": "agentId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "expected",
        "type": "uint8",
        "internalType": "enum AgentRegistry.Role"
      }
    ]
  },
  {
    "type": "error",
    "name": "CaseNotFound",
    "inputs": [
      {
        "name": "caseId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "InsufficientDebtTokenBalance",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "contract IERC20"
      },
      {
        "name": "required",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "available",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "InsufficientNativeBalance",
    "inputs": [
      {
        "name": "required",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "available",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidRoutePayload",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidScorePayload",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NegativeAgentResponse",
    "inputs": [
      {
        "name": "value",
        "type": "int256",
        "internalType": "int256"
      }
    ]
  },
  {
    "type": "error",
    "name": "OnlySomniaPlatform",
    "inputs": [
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "OwnableInvalidOwner",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "OwnableUnauthorizedAccount",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "PositionHealthy",
    "inputs": [
      {
        "name": "healthFactor",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ReentrancyGuardReentrantCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "RouterAlreadyAdvanced",
    "inputs": [
      {
        "name": "caseId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "RouterPayloadEmpty",
    "inputs": []
  },
  {
    "type": "error",
    "name": "RouterSentinelAgentIdNotSet",
    "inputs": []
  },
  {
    "type": "error",
    "name": "RouterSomniaAgentIdNotSet",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SafeERC20FailedOperation",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ScorerPayloadEmpty",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ScorerSentinelAgentIdNotSet",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ScorerSomniaAgentIdNotSet",
    "inputs": []
  },
  {
    "type": "error",
    "name": "UnknownRequest",
    "inputs": [
      {
        "name": "requestId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "WrongStatus",
    "inputs": [
      {
        "name": "caseId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "expected",
        "type": "uint8",
        "internalType": "enum Coordinator.CaseStatus"
      },
      {
        "name": "actual",
        "type": "uint8",
        "internalType": "enum Coordinator.CaseStatus"
      }
    ]
  }
] as const;
