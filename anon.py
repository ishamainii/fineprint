# anon.py: naming rules shared by export.py and export_model.py
# PUBLIC = True: platforms are published under their real names (Twitter merged into X).
# The classifier is always trained on text with company and product names stripped, so it learns
# how a training clause is worded, not which company tends to write one.
import random
import re

# ---------------------------------------------------------------- anonymising
CATEGORY = {
    "Facebook": "social network", "Instagram": "social network", "LinkedIn": "social network", "BeReal": "social network",
    "Pinterest": "social network", "Upscrolled": "social network", "Moltbook": "social network",
    "LINE": "messaging", "Telegram": "messaging", "WeChat": "messaging", "WhatsApp": "messaging", "Snapchat": "messaging",
    "Parler": "microblog", "Twitter": "microblog", "X": "microblog", "Bluesky": "microblog", "Threads": "microblog",
    "TruthSocial": "microblog", "Mastodon": "microblog", "Tumblr": "microblog",
    "TikTok": "video & streaming", "YouTube": "video & streaming", "Twitch": "video & streaming", "Spotify": "video & streaming",
    "Quora": "community & forum", "Reddit": "community & forum",
}
MERGE = {"Twitter": "X"}
names = sorted(set(MERGE.get(p, p) for p in CATEGORY))
random.Random(20261104).shuffle(names)
CODE = {n: chr(65 + i) for i, n in enumerate(names)}
PUBLIC = True
DISPLAY = {"TruthSocial": "Truth Social"}
code = lambda p: DISPLAY.get(MERGE.get(p, p), MERGE.get(p, p)) if PUBLIC else CODE[MERGE.get(p, p)]
cat = lambda p: CATEGORY[MERGE.get(p, p)]

NAMES = ["Facebook", "Meta", "Instagram", "WhatsApp", "Messenger", "Threads", "LINE", "LY Corporation", "LinkedIn", "Microsoft",
         "Parler", "Pinterest", "Quora", "Poe", "Reddit", "Snapchat", "Snap Inc", "Snap", "Spotify", "Telegram", "TikTok",
         "ByteDance", "Tumblr", "Automattic", "Twitch", "Amazon", "WeChat", "Weixin", "Tencent", "YouTube", "Google", "Alphabet",
         "Twitter", "X Corp", "xAI", "Bluesky", "Truth Social", "TruthSocial", "TMTG", "Trump Media", "BeReal", "Upscrolled",
         "Moltbook", "Mastodon", "OpenAI", "Azure", "Anthropic"]
PRODUCTS = ["My AI", "Bard", "Gemini", "Grok", "Llama", "ChatGPT", "Copilot", "Cloud AI", "Google Translate", "Translate", "AI at Meta", "Meta AI"]
_prod = re.compile(r"\b(" + "|".join(re.escape(p) for p in sorted(PRODUCTS, key=len, reverse=True)) + r")\b")
_name = re.compile(r"\b(" + "|".join(re.escape(p) for p in sorted(NAMES, key=len, reverse=True)) + r")(?:'s|’s)?\b")
_x = re.compile(r"\b(?:on|of|to|use|using|from) X\b")


_users = re.compile(r"\b(?:snapchatters?|redditors?|tiktokers?|youtubers?|instagrammers?|tweeters?|pinners?)\b", re.I)


def strip_names(s):
    s = _users.sub("[company] users", s)
    s = re.sub(r"<br\s*", "; ", s)
    s = re.sub(r"https?://\S+|www\.\S+|\S+\.(?:com|net|org)\S*", "[link]", s)
    s = _prod.sub("[product]", s)
    s = _name.sub("[company]", s)
    s = _x.sub(lambda m: m.group(0)[:-1] + "[company]", s)
    return " ".join(s.split())




def clean(s):
    s = re.sub(r"<br\s*", "; ", s)
    s = re.sub(r"https?://\S+|www\.\S+", "[link]", s)
    return " ".join(s.split())


def redact(s):
    """text as published on the site"""
    return clean(s) if PUBLIC else strip_names(s)
