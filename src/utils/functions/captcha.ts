import { getZeroWidth } from "../chatreactions/utils";

const locked: string[] = [];

export function isLockedOut(string: string): boolean {
    if (locked.indexOf(string) == -1) {
        return false;
    } else {
        return true;
    }
}

export function toggleLock(string: string) {
    if (isLockedOut(string)) {
        locked.splice(locked.indexOf(string), 1);
    } else {
        locked.push(string);
    }
}

export function createCaptcha(): Captcha {
    return new Captcha(Math.random().toString(36).substr(2, 7));
}

class Captcha {
    public answer: string;
    public display: string;
    constructor(d: string) {
        this.answer = d;

        const zeroWidthCount = d.length / 2;

        const zeroWidthChar = getZeroWidth();

        let displayWord = d;

        for (let i = 0; i < zeroWidthCount; i++) {
            const pos = Math.floor(Math.random() * d.length + 1);

            displayWord = displayWord.substring(0, pos) + zeroWidthChar + displayWord.substring(pos);
        }

        this.display = displayWord;

        return this;
    }
}
