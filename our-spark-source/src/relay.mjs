// Only actual new checkins trigger a one-off reaction; polling/reopening is quiet.
export function getRelayReaction(previous,current) {
  if(!previous||previous.roomId!==current.roomId||previous.today!==current.today)return null;
  const added=current.checked.filter(role=>!previous.checked.includes(role));
  if(!added.length)return null;
  return {kind:current.checked.length===2?'complete':'stoke',role:added.at(-1)};
}
