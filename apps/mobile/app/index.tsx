import { Redirect } from 'expo-router';
import { useSession } from '../src/session';
import { openingSpace, SPACE_HOME, useSpace } from '../src/space';

const Index = () => {
  const { spaces } = useSession();
  const { last } = useSpace();
  const space = openingSpace(last, spaces);
  return space ? <Redirect href={SPACE_HOME[space]} /> : null;
};

export default Index;
