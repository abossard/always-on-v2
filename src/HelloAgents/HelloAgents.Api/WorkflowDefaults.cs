namespace HelloAgents.Api;

public static class WorkflowDefaults
{
    public static WorkflowDefinition DefaultAnswer() => new()
    {
        Id = "system:default-answer",
        Name = "Default Answer",
        Nodes = [new WorkflowNode { Id = "broadcast", Type = "broadcast" }],
        Edges = [],
        Triggers = [new WorkflowTrigger { Type = "user-message" }],
        Version = 0,
        Concurrency = "serial"
    };
}
