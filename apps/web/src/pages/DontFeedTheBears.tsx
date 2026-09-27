import { useSearchParams } from 'react-router-dom'
import PublicNav from '../components/PublicNav'
import BearGame from '../games/bears/BearGame'
import './DontFeedTheBears.css'

const PAGE_TITLE = "Don't Feed the Bears - Chris Gagne"
const PAGE_DESCRIPTION =
  'A short Vermont camp mini-game: secure attractants before black bears reach them, then learn real tips from Vermont Fish & Wildlife.'
const PAGE_URL = 'https://gagnechris.com/dont-feed-the-bears'
const OG_IMAGE = 'https://gagnechris.com/og-dont-feed-the-bears.jpg'

function DontFeedTheBears() {
  const [searchParams] = useSearchParams()
  const from = searchParams.get('from')?.trim() || 'direct'

  return (
    <div className="bears-page">
      <title>{PAGE_TITLE}</title>
      <meta name="description" content={PAGE_DESCRIPTION} />
      <link rel="canonical" href={PAGE_URL} />
      <meta property="og:title" content={PAGE_TITLE} />
      <meta property="og:description" content={PAGE_DESCRIPTION} />
      <meta property="og:type" content="website" />
      <meta property="og:url" content={PAGE_URL} />
      <meta property="og:image" content={OG_IMAGE} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={PAGE_TITLE} />
      <meta name="twitter:description" content={PAGE_DESCRIPTION} />
      <meta name="twitter:image" content={OG_IMAGE} />
      <header className="bears-page__header">
        <div>
          <p className="bears-page__eyebrow">Vermont camp rules</p>
          <h1>Don't Feed the Bears</h1>
        </div>
        <PublicNav />
      </header>
      <main>
        <BearGame from={from} />
      </main>
    </div>
  )
}

export default DontFeedTheBears
