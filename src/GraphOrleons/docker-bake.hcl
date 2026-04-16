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
  dockerfile = "GraphOrleons/GraphOrleons.Api/Dockerfile"
  tags       = tag("graphorleons")
  platforms  = ["linux/amd64", "linux/arm64"]
  cache-from = ["type=gha,scope=graphorleons-api"]
  cache-to   = ["type=gha,mode=max,scope=graphorleons-api"]
}

target "web" {
  context    = "GraphOrleons.Web"
  dockerfile = "Dockerfile"
  tags       = tag("graphorleons-web")
  platforms  = ["linux/amd64", "linux/arm64"]
  cache-from = ["type=gha,scope=graphorleons-web"]
  cache-to   = ["type=gha,mode=max,scope=graphorleons-web"]
}
