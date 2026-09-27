import { Link } from 'react-router-dom'
import BearGame from '../games/bears/BearGame'
import './DontFeedTheBears.css'

function DontFeedTheBears() {
  return (
    <div className="bears-page">
      <title>Don't Feed the Bears - Chris Gagne</title>
      <meta
        name="description"
        content="A short Vermont camp mini-game: secure attractants before black bears reach them, then learn real tips from Vermont Fish & Wildlife."
      />
      <header className="bears-page__header">
        <div>
          <p className="bears-page__eyebrow">Vermont camp rules</p>
          <h1>Don't Feed the Bears</h1>
        </div>
        <Link to="/" className="back-link">
          Back to Home
        </Link>
      </header>
      <main>
        <BearGame />
      </main>
    </div>
  )
}

export default DontFeedTheBears
