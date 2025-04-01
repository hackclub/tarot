import { Glob } from "bun"

const glob = new Glob("./kv/user_hand:*")

async function getUserCounts() {
  // not... totally sure why I can't just files.length, but I wasn't getting valid results from it
  let i = 0
  for await (const _file of glob.scan(".")) {
    i++
  }

  return i
}

export default getUserCounts
