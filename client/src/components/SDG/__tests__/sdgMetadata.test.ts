import { getSDGGoalTitle, getSDGNodeTitle, getSDGTargetTitle } from '../sdgMetadata';

describe('sdgMetadata', () => {
  it('should resolve goal titles from SDG goal names', () => {
    expect(getSDGGoalTitle('SDG 1')).toBe('No Poverty');
    expect(getSDGNodeTitle('SDG 6')).toBe('Clean Water and Sanitation');
  });

  it('should resolve target titles from target names', () => {
    expect(getSDGTargetTitle('Target 1.5')).toBe(
      'By 2030, build the resilience of the poor and those in vulnerable situations and reduce their exposure and vulnerability to climate-related extreme events and other economic, social and environmental shocks and disasters.',
    );
    expect(getSDGNodeTitle('Target 6.4')).toBe(
      'By 2030, substantially increase water-use efficiency across all sectors and ensure sustainable withdrawals and supply of freshwater to address water scarcity and substantially reduce the number of people suffering from water scarcity.',
    );
  });

  it('should return null when there is no matching title', () => {
    expect(getSDGTargetTitle('undetected_target')).toBeNull();
    expect(getSDGNodeTitle('Unmapped node')).toBeNull();
  });
});
