import profile from './assets/profile.jpg'
import './App.css'

function App() {
  return (
    <>
      <header>
        <img src={profile} className="profile" alt="profile" />
        <h1>Chris Gagne</h1>
        <p>Welcome to my personal website!</p>
      </header>
      <main>
        <section id="about">
          <h2>About Me</h2>
          <p>
            I am the Director of Engineering at Ro. I have more than 20 years
            experience in software engineering building modern web technologies
            to solve critical business problems with a passion for using
            technology to improve the lives of everyday people.
          </p>
        </section>
        <section id="quick-linkes">
          <h2>Quick Links</h2>
          <ul>
            <li>
              <a href="https://www.linkedin.com/in/christophergagne/">LinkedIn</a>
            </li>
            <li>
              <a href="https://github.com/gagnechris">GitHub</a>
            </li>
          </ul>
        </section>
      </main>
    </>
  )
}

export default App
