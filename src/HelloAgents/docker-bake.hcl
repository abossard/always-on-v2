variable "REGISTRY" { default = "" }
variable "TAG" { default = "latest" }

function "tag" {
  params = [name]
  result = REGISTRY != "" ? ["${REGISTRY}/${name}:${TAG}"] : ["${name}:${TAG}"]
}

group "default" {
  targets = ["api", "web"]
}

target "api" {
  context    = ".."
  dockerfile = "HelloAgents/HelloAgents.Api/Dockerfile"
  tags       = tag("helloagents")
  platforms  = ["linux/amd64", "linux/arm64"]
  cache-from = ["type=gha,scope=helloagents-api"]
  cache-to   = ["type=gha,mode=max,scope=helloagents-api"]
}

target "web" {
  context    = "HelloAgents.Web"
  dockerfile = "Dockerfile"
  tags       = tag("helloagents-web")
  platforms  = ["linux/amd64", "linux/arm64"]
  cache-from = ["type=gha,scope=helloagents-web"]
  cache-to   = ["type=gha,mode=max,scope=helloagents-web"]
}
