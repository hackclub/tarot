import { Glob } from "bun"

const glob = new Glob("./kv/user_hand:*")

// Scans the current working directory and each of its sub-directories recursively
async function getUserCounts() {
  const files = await glob.scan(".")
  return files.length
}

export default getUserCounts
