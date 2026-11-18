// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @dev Minimal view of the SPACE ID Agent ID registry (soulbound ERC-721, one handle per address).
interface IAgentID {
    function balanceOf(address owner) external view returns (uint256);
    function ownerOfHandle(string calldata handle) external view returns (address);
}

/// @title AgentVouch - an on-chain trust graph between Agent ID holders.
/// @notice An Agent ID holder can vouch for another Agent ID holder, once per pair. A vouch can be
///         withdrawn by the voucher. No fees, no tokens, no admin powers.
/// @dev Both edge directions are stored as enumerable lists so the graph can be read straight from
///      the contract without an indexer.
contract AgentVouch {
    /// @notice SPACE ID Agent ID registry on BNB Chain (chain 56).
    IAgentID public constant AGENT_ID = IAgentID(0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F);

    uint256 public constant MAX_NOTE_BYTES = 140;

    /// @notice Project owner (attribution only). This address has NO special permissions:
    ///         there is no function in this contract that checks it.
    address public immutable owner;

    /// @notice Number of active vouches an address has received.
    mapping(address => uint256) public vouchCount;
    /// @notice Number of active vouches an address has given.
    mapping(address => uint256) public givenCount;

    /// @dev recipient => list of vouchers; voucher => list of recipients
    mapping(address => address[]) private _vouchers;
    mapping(address => address[]) private _vouchees;
    /// @dev voucher => recipient => position+1 in _vouchers[recipient] (0 = no vouch)
    mapping(address => mapping(address => uint256)) private _inPos;
    /// @dev voucher => recipient => position+1 in _vouchees[voucher]
    mapping(address => mapping(address => uint256)) private _outPos;

    event Vouched(address indexed voucher, address indexed recipient, string note);
    event Unvouched(address indexed voucher, address indexed recipient);

    error NotAgentIdHolder();
    error RecipientNotAgentIdHolder();
    error UnknownHandle();
    error SelfVouch();
    error AlreadyVouched();
    error NotVouched();
    error NoteTooLong();

    constructor(address owner_) {
        owner = owner_;
    }

    /// @notice Vouch for `recipient`. Both caller and recipient must hold an Agent ID.
    /// @param note optional public message (max 140 bytes), emitted in the event only
    function vouch(address recipient, string calldata note) public {
        if (AGENT_ID.balanceOf(msg.sender) == 0) revert NotAgentIdHolder();
        if (AGENT_ID.balanceOf(recipient) == 0) revert RecipientNotAgentIdHolder();
        if (recipient == msg.sender) revert SelfVouch();
        if (_inPos[msg.sender][recipient] != 0) revert AlreadyVouched();
        if (bytes(note).length > MAX_NOTE_BYTES) revert NoteTooLong();

        _vouchers[recipient].push(msg.sender);
        _inPos[msg.sender][recipient] = _vouchers[recipient].length;
        _vouchees[msg.sender].push(recipient);
        _outPos[msg.sender][recipient] = _vouchees[msg.sender].length;
        unchecked {
            ++vouchCount[recipient];
            ++givenCount[msg.sender];
        }
        emit Vouched(msg.sender, recipient, note);
    }

    /// @notice Vouch by Agent ID handle, resolved on chain by the registry.
    /// @param handle bare handle without the ".ai" suffix, e.g. "jumaic"
    function vouchHandle(string calldata handle, string calldata note) external {
        address recipient = AGENT_ID.ownerOfHandle(handle);
        if (recipient == address(0)) revert UnknownHandle();
        vouch(recipient, note);
    }

    /// @notice Withdraw your vouch for `recipient`.
    function unvouch(address recipient) external {
        uint256 inPos = _inPos[msg.sender][recipient];
        if (inPos == 0) revert NotVouched();

        // swap-and-pop msg.sender out of _vouchers[recipient]
        address[] storage ins = _vouchers[recipient];
        address movedVoucher = ins[ins.length - 1];
        ins[inPos - 1] = movedVoucher;
        _inPos[movedVoucher][recipient] = inPos;
        ins.pop();
        delete _inPos[msg.sender][recipient];

        // swap-and-pop recipient out of _vouchees[msg.sender]
        uint256 outPos = _outPos[msg.sender][recipient];
        address[] storage outs = _vouchees[msg.sender];
        address movedRecipient = outs[outs.length - 1];
        outs[outPos - 1] = movedRecipient;
        _outPos[msg.sender][movedRecipient] = outPos;
        outs.pop();
        delete _outPos[msg.sender][recipient];

        unchecked {
            --vouchCount[recipient];
            --givenCount[msg.sender];
        }
        emit Unvouched(msg.sender, recipient);
    }

    // ----------------------------------------------------------------- views

    /// @notice Whether `voucher` currently vouches for `recipient`.
    function hasVouched(address voucher, address recipient) external view returns (bool) {
        return _inPos[voucher][recipient] != 0;
    }

    /// @notice Page through the addresses vouching for `recipient`.
    function vouchersOf(address recipient, uint256 offset, uint256 limit) external view returns (address[] memory) {
        return _page(_vouchers[recipient], offset, limit);
    }

    /// @notice Page through the addresses `voucher` vouches for.
    function vouchedBy(address voucher, uint256 offset, uint256 limit) external view returns (address[] memory) {
        return _page(_vouchees[voucher], offset, limit);
    }

    /// @notice True if `account` currently holds an Agent ID.
    function isAgent(address account) external view returns (bool) {
        return AGENT_ID.balanceOf(account) > 0;
    }

    function _page(address[] storage list, uint256 offset, uint256 limit) private view returns (address[] memory out) {
        uint256 len = list.length;
        if (offset >= len) return out;
        uint256 end = limit > len - offset ? len : offset + limit;
        out = new address[](end - offset);
        for (uint256 i; i < out.length; ++i) {
            out[i] = list[offset + i];
        }
    }
}
