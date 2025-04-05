const store = new Map()

export const kv = {
  set(key, value, expirationMs = null, backed = false) {
    console.time('set', key, value)
    const entry = {
      value,
      expiresAt: expirationMs ? Date.now() + expirationMs : null
    }
    store.set(key, entry)
    // if backed, write to disk
    if (backed) {
      Bun.write('kv/' + key, JSON.stringify(value))
    }
    console.timeEnd('set', key)
  },
  async get(key, backed = false) {
    console.time('get', key)
    let entry = store.get(key)
    // check if the file exists on disk
    if (!entry && backed) {
      const file = Bun.file('./kv/' + key)
      if (await file.exists()) {
        try {
          const text = await file.text()
          const value = JSON.parse(text)
          entry = {
            value,
            expiresAt: null
          }
          // Cache in memory for future reads
          store.set(key, entry)
        } catch (error) {
          console.error('Error reading KV file:', error)
          return null
        }
      }
    }

    if (!entry) {
      console.timeEnd('get', key)
      return null
    }
    
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      store.delete(key)
      console.timeEnd('get', key)
      return null
    }
    
    console.timeEnd('get', key)
    return entry.value
  },

  delete(key) {
    store.delete(key)
  }
}