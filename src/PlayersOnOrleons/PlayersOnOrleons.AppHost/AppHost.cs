using PlayersOnOrleons.AppHost;

var builder = DistributedApplication.CreateBuilder(args);

builder.AddProject<Projects.PlayersOnOrleons_Api>(ResourceNames.Api)
	.WithExternalHttpEndpoints();

builder.Build().Run();
