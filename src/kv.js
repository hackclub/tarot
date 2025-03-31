const store = new Map()

export const kv = {
  set(key, value, expirationMs = null, backed = false) {
    const entry = {
      value,
      expiresAt: expirationMs ? Date.now() + expirationMs : null
    }
    store.set(key, entry)
    // if backed, write to disk
    if (backed) {
      Bun.write('kv/' + key, JSON.stringify(value))
    }
  },

  async get(key, backed = false) {
    console.log('get', key, backed)
    let entry = store.get(key)
    console.log('entry', entry)
    // check if the file exists on disk
    if (!entry && backed) {
      const file = Bun.file('./kv/' + key)
      console.log('file', file)
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

    if (!entry) return null
    
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      store.delete(key)
      return null
    }
    
    return entry.value
  },

  delete(key) {
    store.delete(key)
  }
}