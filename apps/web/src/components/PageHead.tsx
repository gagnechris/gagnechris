import {
  usePageHead,
  type PageHead as PageHeadProps,
} from '../utils/usePageHead';

const PageHead = (props: PageHeadProps) => {
  usePageHead(props);
  return null;
};

export default PageHead;
