import { Redirect } from 'expo-router';
import { useSession } from '../src/session';
import { openingSpace, SPACE_HOME, useSpace } from '../src/space';

const Index = () => {
  const { status, expired, spaces } = useSession();
  const { last } = useSpace();
  if (status !== 'signedIn') {
    return <Redirect href={expired ? '/site/account' : '/site/home'} />;
  }
  const space = openingSpace(last, spaces);
  return <Redirect href={space ? SPACE_HOME[space] : '/no-access'} />;
};

export default Index;
