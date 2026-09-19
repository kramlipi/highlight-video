function crc32(data: Uint8Array) {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i += 1) {
    crc ^= data[i]
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function u16(value: number) {
  const out = new Uint8Array(2)
  new DataView(out.buffer).setUint16(0, value, true)
  return out
}

function u32(value: number) {
  const out = new Uint8Array(4)
  new DataView(out.buffer).setUint32(0, value, true)
  return out
}

export async function zipStoreFiles(files: { name: string; blob: Blob }[]): Promise<Blob> {
  const encoder = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0

  for (const file of files) {
    const name = encoder.encode(file.name.replace(/\\/g, '/'))
    const data = new Uint8Array(await file.blob.arrayBuffer())
    if (data.byteLength >= 0xffff_ffff) {
      throw new Error('A short is too large to pack into a classic zip. Download it on its own.')
    }
    const crc = crc32(data)
    const local = new Uint8Array(30 + name.length + data.length)
    local.set([0x50, 0x4b, 0x03, 0x04], 0)
    local.set(u16(20), 4)
    local.set(u16(0), 8)
    local.set(u32(crc), 14)
    local.set(u32(data.length), 18)
    local.set(u32(data.length), 22)
    local.set(u16(name.length), 26)
    local.set(name, 30)
    local.set(data, 30 + name.length)
    locals.push(local)

    const central = new Uint8Array(46 + name.length)
    central.set([0x50, 0x4b, 0x01, 0x02], 0)
    central.set(u16(20), 4)
    central.set(u16(20), 6)
    central.set(u32(crc), 16)
    central.set(u32(data.length), 20)
    central.set(u32(data.length), 24)
    central.set(u16(name.length), 28)
    central.set(u32(offset), 42)
    central.set(name, 46)
    centrals.push(central)
    offset += local.length
  }

  const cdSize = centrals.reduce((sum, part) => sum + part.length, 0)
  const eocd = new Uint8Array(22)
  eocd.set([0x50, 0x4b, 0x05, 0x06], 0)
  eocd.set(u16(files.length), 8)
  eocd.set(u16(files.length), 10)
  eocd.set(u32(cdSize), 12)
  eocd.set(u32(offset), 16)

  return new Blob([...locals, ...centrals, eocd] as BlobPart[], { type: 'application/zip' })
}
