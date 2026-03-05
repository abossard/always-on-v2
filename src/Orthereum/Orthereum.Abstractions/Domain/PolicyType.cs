namespace Orthereum.Abstractions.Domain;

[GenerateSerializer]
public enum PolicyType
{
    Token,
    Escrow,
    Voting,
    MultiSig,
    Royalty,
    Auction,
}
