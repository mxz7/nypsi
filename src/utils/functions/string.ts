import * as CryptoJS from "crypto-js"

/**
 * @returns {String}
 * @param {String} string
 */
export function cleanString(string: string): string {
    return string.replace(/[^A-z0-9\s]/g, "")
}

export function encrypt(content: string): string {
    let ciphertext

    try {
        ciphertext = CryptoJS.AES.encrypt(content, process.env.ENCRYPT_KEY)
    } catch {
        return "noencrypt:@:"
    }

    return ciphertext.toString()
}

export function decrypt(ciphertext: string): string {
    if (ciphertext.startsWith("noencrypt:@:")) {
        return ciphertext.split("noencrypt:@:")[1]
    }

    const bytes = CryptoJS.AES.decrypt(ciphertext, process.env.ENCRYPT_KEY)

    return bytes.toString(CryptoJS.enc.Utf8)
}
