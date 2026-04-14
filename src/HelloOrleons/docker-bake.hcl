variable "REGISTRY" { default = "" }
variable "TAG" { default = "latest" }

function "tag" {
  params = [name]
  result = REGISTRY != "" ? ["${REGISTRY}/${name}:${TAG}"] : ["${name}:${TAG}"]
}

group "default" {
  targets = ["api"]
}

target "api" {
  context    = ".."
  dockerfile = "HelloOrleons/HelloOrleons.Api/Dockerfile"
  tags       = tag("helloorleons")
  platforms  = ["linux/amd64", "linux/arm64"]
  cache-from = ["type=gha,scope=helloorleons-api"]
  cache-to   = ["type=gha,mode=max,scope=helloorleons-api"]
}
