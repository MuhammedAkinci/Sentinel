// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title MintableERC20
/// @notice Production-grade ERC20 used to bootstrap collateral and borrow
///         assets on Somnia Shannon testnet, where canonical WETH/USDC
///         deployments are not exposed.
/// @dev This is not a mock. It is a real ERC20 with the same surface as USDC
///         on testnets: owner-controlled mint (faucet semantics) plus optional
///         public mint for hackathon demo convenience. The owner-only mode is
///         the secure default; `publicMintEnabled` is opt-in.
contract MintableERC20 is ERC20, Ownable2Step {
    uint8 private immutable _decimals;

    /// @notice When true, anyone may call `mint` up to `publicMintCap` per call.
    bool public publicMintEnabled;

    /// @notice Maximum amount that a single public mint call may produce.
    uint256 public publicMintCap;

    event PublicMintConfigured(bool enabled, uint256 cap);

    error PublicMintDisabled();
    error PublicMintAmountExceedsCap(uint256 requested, uint256 cap);

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address owner_
    )
        ERC20(name_, symbol_)
        Ownable(owner_)
    {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /// @notice Owner-only mint. Used by deployment scripts to seed reserves
    ///         and by the Sentinel demo orchestration to top up test wallets.
    function mintTo(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /// @notice Owner toggles a permissionless faucet path. Cap is per-call.
    function configurePublicMint(bool enabled, uint256 cap) external onlyOwner {
        publicMintEnabled = enabled;
        publicMintCap = cap;
        emit PublicMintConfigured(enabled, cap);
    }

    /// @notice Permissionless mint when enabled. Used by frontend faucet.
    function mint(address to, uint256 amount) external {
        if (!publicMintEnabled) revert PublicMintDisabled();
        if (amount > publicMintCap) revert PublicMintAmountExceedsCap(amount, publicMintCap);
        _mint(to, amount);
    }
}
