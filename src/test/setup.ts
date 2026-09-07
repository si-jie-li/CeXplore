import '@testing-library/jest-dom/vitest'

if (!Blob.prototype.text) {
  Blob.prototype.text = function text() {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ''))
      reader.onerror = () => reject(reader.error)
      reader.readAsText(this)
    })
  }
}
