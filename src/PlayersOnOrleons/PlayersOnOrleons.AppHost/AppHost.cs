using PlayersOnOrleons.AppHost;

var builder = DistributedApplication.CreateBuilder(args);

builder.AddProject<Projects.PlayersOnOrleons_Api>(
		name: ResourceNames.Api,
		configure: static project =>
		{
			project.ExcludeLaunchProfile = true;
		})
	.WithHttpEndpoint()
	.WithExternalHttpEndpoints();

builder.Build().Run();
