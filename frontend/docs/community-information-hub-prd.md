# Product Requirements Document (PRD) & Database Schema
## Community Information Hub & Knowledge Engine

> **Version:** 1.0.0  
> **Target Platform:** KAI Nuvari Protocol (Next.js + Neon Postgres + IPFS + Paystack / Ethereum & Hedera)  
> **Purpose:** A decentralized media and education hub connecting **Content Creators** (Field Reporters, Journal Authors, Agri-Experts, News Publishers) with **Readers & Audio Listeners** in community networks.

---

## 1. Executive Summary & Media Flow Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                   ✍️ Content Creators & Publishers                       │
│    (Field Reporters, Agri-Experts, Journal Authors, Podcast Hosts)     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ├── Text / Markdown Articles
                                    ├── 🎙️ Audio Podcasts & Voice Journals (IPFS)
                                    └── 📸 Geotagged Field Reports
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               📰 KAI Community Information Hub (Neon DB)                │
│    Categorized by: Forestry MRV · MSME Tips · Chama Yields · Market News  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                  🎧 Readers, Listeners & Community Members             │
│       • Read & Listen (Multi-lingual / Text-to-Speech)                 │
│       • 💡 Tip Creators (Instant Paystack / yBOB Micropayments)        │
│       • 💬 Comment & Share Knowledge                                   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Complete Database Schema (Prisma ORM)

File: `prisma/schema.prisma`

```prisma
// ============================================================================
// 1. CONTENT CREATOR PROFILES & AUTHOR BADGES
// ============================================================================
model CreatorProfile {
  id                String            @id @default(cuid())
  userId            String            @unique // Links to UnifiedUserProfile
  penName           String            // Author / Channel Name
  bio               String?
  avatarIpfsHash    String?
  badge             CreatorBadge      @default(COMMUNITY_REPORTER)
  isVerified        Boolean           @default(false)
  totalPosts        Int               @default(0)
  totalTipsEarnedKes Float            @default(0)
  createdAt         DateTime          @default(now())

  posts             ContentPost[]
  creatorTips       CreatorTip[]      @relation("CreatorTips")

  @@map("creator_profiles")
}

enum CreatorBadge {
  COMMUNITY_REPORTER  // Active field reporter / planter logging updates
  AGRI_EXPERT         // Certified agricultural advisor
  CHAMA_MENTOR        // Financial literacy & savings specialist
  JOURNALIST          // News & market analyst
}

// ============================================================================
// 2. CONTENT POSTS, JOURNALS & AUDIO PODCASTS
// ============================================================================
model ContentPost {
  id                   String            @id @default(cuid())
  slug                 String            @unique // e.g. "how-to-protect-bamboo-seedlings-in-dry-season"
  creatorId            String
  title                String
  summary              String            // Short excerpt for feed preview
  contentMarkdown      String            // Full article text / report
  
  contentType          ContentType       @default(ARTICLE)
  category             ContentCategory   @default(FORESTRY_MRV)
  language             String            @default("sw") // "sw" (Swahili), "en" (English), "sheng"
  
  // Media Assets (Stored on IPFS)
  coverImageIpfsHash   String?
  audioIpfsHash        String?           // For Audio Podcasts & Voice Notes
  audioDurationSeconds Int?              // Duration for podcast player
  documentPdfIpfsHash  String?           // Downloadable PDF journal / report

  // Engagement Metrics
  viewsCount           Int               @default(0)
  likesCount           Int               @default(0)
  tipsEarnedKes        Float             @default(0)
  
  status               PublishStatus     @default(PUBLISHED)
  publishedAt          DateTime          @default(now())
  createdAt            DateTime          @default(now())
  updatedAt            DateTime          @updatedAt

  creator              CreatorProfile    @relation(fields: [creatorId], references: [id])
  comments             PostComment[]
  tips                 CreatorTip[]

  @@index([category])
  @@index([contentType])
  @@index([publishedAt])
  @@map("content_posts")
}

enum ContentType {
  ARTICLE            // Written guide or news piece
  FIELD_JOURNAL      // On-the-ground MRV / planting report
  AUDIO_PODCAST      // Voice note / radio podcast episode
  MARKET_NEWS        // Real-time crop/commodity pricing news
  EDUCATIONAL_GUIDE  // Step-by-step tutorial
}

enum ContentCategory {
  FORESTRY_MRV       // Tree planting, carbon credits, conservation
  MSME_GROWTH        // Business bookkeeping, anti-counterfeit tips
  CHAMA_SAVINGS      // Group finance, yield strategies, SACCOs
  AGRI_MARKET        // Commodity prices, weather forecasts, pest alerts
}

enum PublishStatus {
  DRAFT
  PUBLISHED
  ARCHIVED
}

// ============================================================================
// 3. COMMENTS & COMMUNITY DISCUSSION
// ============================================================================
model PostComment {
  id           String      @id @default(cuid())
  postId       String
  authorUserId String      // Links to UnifiedUserProfile
  commentText  String
  createdAt    DateTime    @default(now())

  post         ContentPost @relation(fields: [postId], references: [id], onDelete: Cascade)

  @@index([postId])
  @@map("post_comments")
}

// ============================================================================
// 4. CREATOR TIPPING & MICROPAYMENTS
// ============================================================================
model CreatorTip {
  id             String         @id @default(cuid())
  postId         String
  creatorId      String
  tipperUserId   String         // Listener / Reader giving the tip
  amountKes      Float
  paymentRef     String         @unique // Paystack / M-Pesa transaction reference
  txHash         String?        // Ethereum & Hedera on-chain tx hash if paid in yBOB
  status         PaymentStatus  @default(SUCCESS)
  createdAt      DateTime       @default(now())

  post           ContentPost    @relation(fields: [postId], references: [id])
  creator        CreatorProfile @relation("CreatorTips", fields: [creatorId], references: [id])

  @@index([creatorId])
  @@map("creator_tips")
}

enum PaymentStatus {
  PENDING
  SUCCESS
  FAILED
}
```

---

## 3. Audio & Podcast Streaming Player Component (Next.js)

For users who prefer listening to field journals, voice notes, or market news in local languages:

```tsx
// src/components/AudioPodcastPlayer.tsx
'use client';

import { useState, useRef } from 'react';
import { Play, Pause, Volume2, Share2, Heart, DollarSign } from 'lucide-react';

interface PodcastProps {
  title: string;
  creatorName: string;
  audioIpfsUrl: string; // e.g. "https://ipfs.io/ipfs/bafybei..."
  durationSeconds: number;
  likesCount: number;
  onTipClick: () => void;
}

export default function AudioPodcastPlayer({
  title,
  creatorName,
  audioIpfsUrl,
  durationSeconds,
  likesCount,
  onTipClick,
}: PodcastProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [likes, setLikes] = useState(likesCount);
  const [hasLiked, setHasLiked] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleLike = () => {
    if (hasLiked) {
      setLikes(l => l - 1);
      setHasLiked(false);
    } else {
      setLikes(l => l + 1);
      setHasLiked(true);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="w-full bg-gradient-to-r from-[#181824] to-[#0f0f18] border border-gold-base/20 rounded-2xl p-4 text-white shadow-xl">
      <audio ref={audioRef} src={audioIpfsUrl} onEnded={() => setIsPlaying(false)} />

      <div className="flex items-center justify-between gap-4">
        {/* Play / Pause Circle */}
        <button
          onClick={togglePlay}
          className="w-12 h-12 rounded-full bg-gradient-to-tr from-gold-base to-amber-400 text-black flex items-center justify-center font-bold shadow-lg shadow-gold-base/20 hover:scale-105 transition-transform"
        >
          {isPlaying ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
        </button>

        {/* Podcast Title & Author */}
        <div className="flex-1 min-w-0">
          <span className="text-[10px] uppercase tracking-wider text-gold-base font-bold bg-gold-base/10 px-2 py-0.5 rounded">
            🎙️ Audio Journal
          </span>
          <h4 className="font-bold text-sm text-white truncate mt-1">{title}</h4>
          <p className="text-xs text-white/50">{creatorName} · {formatTime(durationSeconds)}</p>
        </div>

        {/* Engagement Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Like */}
          <button
            onClick={handleLike}
            className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
              hasLiked
                ? 'bg-red-500/20 border-red-500 text-red-400'
                : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
            }`}
          >
            <Heart size={14} className={hasLiked ? 'fill-current' : ''} />
            <span>{likes}</span>
          </button>

          {/* Tip Creator */}
          <button
            onClick={onTipClick}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-bold hover:bg-emerald-500/30 transition-colors"
          >
            <DollarSign size={14} />
            <span>Tip</span>
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## 4. Key Creator & Reader API Routes

| Method | Endpoint | Description |
|---|---|---|
| **POST** | `/api/hub/posts` | Create & publish a new article, field journal, or audio podcast |
| **GET** | `/api/hub/feed?category=FORESTRY_MRV` | Retrieve posts feed filtered by category or content type |
| **GET** | `/api/hub/posts/:slug` | Retrieve single post details & increment view counter |
| **POST** | `/api/hub/tip` | Send instant Paystack / M-Pesa / yBOB micropayment tip to author |
| **POST** | `/api/hub/comments` | Add a community comment to a post |

---

## 5. Next Implementation Steps

1. Save `schema.prisma` models and execute `npx prisma db push`.
2. Build the **Community Information Hub Feed** (`src/app/hub/page.tsx`).
3. Build the **Creator Publishing Studio & Audio Voice Note Recorder** (`src/app/hub/create/page.tsx`).
