namespace HelloAgents.Api;

public sealed class GroupLifecycleService(
    IGrainFactory grainFactory,
    ILogger<GroupLifecycleService> logger)
{
    public async Task<IReadOnlyList<ChatGroupDetail>> ListGroupsAsync()
    {
        var registry = grainFactory.GetGrain<IGroupRegistryGrain>("default");
        var entries = await registry.ListAsync();

        var groups = new List<ChatGroupDetail>();
        foreach (var (id, _) in entries)
        {
            try
            {
                var grain = grainFactory.GetGrain<IChatGroupGrain>(id);
                groups.Add(await grain.GetStateAsync());
            }
            catch (InvalidOperationException)
            {
                logger.LogWarning("Auto-cleaning stale group registry entry {GroupId}", id);
                await registry.UnregisterAsync(id);
            }
        }

        return groups
            .OrderBy(g => g.CreatedAt)
            .ThenBy(g => g.Name, StringComparer.OrdinalIgnoreCase)
            .ThenBy(g => g.Id, StringComparer.Ordinal)
            .ToArray();
    }

    public async Task<IReadOnlyList<ChatGroupSummary>> ListGroupSummariesAsync()
    {
        var groups = await ListGroupsAsync();
        return groups
            .Select(g => new ChatGroupSummary(
                g.Id,
                g.Name,
                g.Description,
                g.Agents.Count,
                g.Messages.Count(m => m.EventType == EventType.Message),
                g.CreatedAt))
            .ToArray();
    }

    public async Task<bool> DeleteGroupAsync(string groupId)
    {
        var registry = grainFactory.GetGrain<IGroupRegistryGrain>("default");

        ChatGroupDetail group;
        try
        {
            var grain = grainFactory.GetGrain<IChatGroupGrain>(groupId);
            group = await grain.GetStateAsync();
        }
        catch (InvalidOperationException)
        {
            await registry.UnregisterAsync(groupId);
            return false;
        }

        foreach (var agent in group.Agents)
        {
            try
            {
                var agentGrain = grainFactory.GetGrain<IAgentGrain>(agent.Id);
                await agentGrain.LeaveGroupAsync(groupId);
            }
            catch (InvalidOperationException ex)
            {
                logger.AgentMissingDuringGroupDelete(ex,
                    agent.Id,
                    groupId);
            }
        }

        var groupGrain = grainFactory.GetGrain<IChatGroupGrain>(groupId);
        await groupGrain.DeleteAsync();
        await registry.UnregisterAsync(groupId);

        logger.GroupDeleted(
            group.Name,
            groupId,
            group.Agents.Count);

        return true;
    }

    public async Task<int> DeleteGroupsAsync(IEnumerable<string> groupIds)
    {
        var deleted = 0;
        foreach (var groupId in groupIds.Distinct(StringComparer.Ordinal))
        {
            if (await DeleteGroupAsync(groupId))
                deleted++;
        }

        return deleted;
    }
}