import { BEAR_TIPS } from '../tips';

type BearTipsListProps = {
  onTipLinkClick: () => void;
};

const BearTipsList = ({ onTipLinkClick }: BearTipsListProps) => (
  <ul className="bears-tips">
    {BEAR_TIPS.map((t) => (
      <li key={t.id} className="bears-tips__card">
        <h3>{t.title}</h3>
        <p>{t.body}</p>
        <a
          href={t.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onTipLinkClick}
        >
          Source
        </a>
      </li>
    ))}
  </ul>
);

export default BearTipsList;
