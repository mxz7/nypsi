export interface RedditJSON {
    data: {
        children: RedditJSONPost[];
    };
    message?: string;
}

export interface RedditJSONPost {
    data: {
        subreddit: string;
        is_self: string;
        url: string;
        title: string;
        permalink: string;
        author: string;
        subreddit_name_prefixed: string;
        over_18: boolean;
    };
}
