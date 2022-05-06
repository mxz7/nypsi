interface News {
    text: string
    date: number
}

const news: News = {
    text: "",
    date: new Date().getTime(),
}

/**
 * @returns {String}
 */
export function getNews(): News {
    return news
}

export function setNews(string: string) {
    news.text = string
    news.date = new Date().getTime()
}
