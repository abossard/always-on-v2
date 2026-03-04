namespace AlwaysOn.GrainInterface;

[Alias("AlwaysOn.GrainInterface.IHello")]
public interface IHello: IGrainWithIntegerKey {
    [Alias("SayHello")]
    ValueTask<string> SayHello(string name);
}