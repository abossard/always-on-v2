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
  context    = "."
  dockerfile = "PlayersOnLevel0.Api/Dockerfile"
  tags       = tag("level0")
  platforms  = ["linux/amd64", "linux/arm64"]
  cache-from = ["type=gha,scope=level0-api"]
  cache-to   = ["type=gha,mode=max,scope=level0-api"]
}

target "web" {
  context    = "PlayersOnLevel0.SPA.Web"
  dockerfile = "Dockerfile"
  tags       = tag("level0-web")
  platforms  = ["linux/amd64", "linux/arm64"]
  cache-from = ["type=gha,scope=level0-web"]
  cache-to   = ["type=gha,mode=max,scope=level0-web"]
}
