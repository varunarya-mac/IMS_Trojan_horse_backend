/**
 * Reference Document
 * Contains domain knowledge for refrigeration analysis
 *
 * NOTE: This is a placeholder. The actual Advanced Signalling Techniques
 * document content should be provided by the user and embedded here.
 */

/**
 * Reference knowledge for refrigeration systems
 */
export const REFERENCE_DOCUMENT = `
# Refrigeration Systems Reference Guide

## Temperature Ranges

### Case Temperatures
- Fresh Food Cases: 0°C to 4°C (32°F to 39°F)
- Frozen Food Cases: -18°C to -23°C (0°F to -10°F)
- Ice Cream Cases: -23°C to -29°C (-10°F to -20°F)

### Pack Temperatures
- Suction Temperatures: -10°C to 5°C depending on application
- Discharge Temperatures: 50°C to 90°C normal operation
- Condenser Approach: 8-15°C above ambient

## Signal Thresholds

### Temperature Alarms
- High Temperature Alert: 5°C above setpoint
- High Temperature Critical: 8°C above setpoint
- Low Temperature Alert: 5°C below setpoint
- Low Temperature Critical: 8°C below setpoint

### Pressure Alarms
- High Discharge Pressure: Equipment specific
- Low Suction Pressure: Equipment specific

## Common Patterns

### Defrost Cycles
- Typical Duration: 15-45 minutes
- Frequency: 2-6 times per day
- Temperature Rise: Normal during defrost

### Door Openings
- Characterized by rapid temperature rise
- Air-on and air-off temperatures diverge
- Recovery time varies by case design

### Equipment Failure Patterns
- Compressor Short-cycling: Rapid on/off pattern
- Condenser Fouling: Rising discharge pressure over time
- Refrigerant Leak: Gradual superheat increase
- Evaporator Icing: Reduced air temperature differential

## Analysis Guidelines

### What to Look For
1. Temperature excursions outside setpoints
2. Abnormal defrost durations or frequencies
3. Pressure trends indicating maintenance needs
4. Signal patterns indicating equipment stress

### Recommendations Categories
1. Immediate Action Required (safety/food quality risk)
2. Maintenance Scheduled (within 1 week)
3. Monitor Condition (watch for changes)
4. Optimization Opportunity (efficiency improvement)
`;

/**
 * Get a section of the reference document
 */
export function getReferenceSection(topic: string): string {
  const topicLower = topic.toLowerCase();

  if (topicLower.includes('temperature')) {
    return REFERENCE_DOCUMENT.split('## Signal Thresholds')[0];
  }

  if (topicLower.includes('alarm') || topicLower.includes('signal')) {
    const start = REFERENCE_DOCUMENT.indexOf('## Signal Thresholds');
    const end = REFERENCE_DOCUMENT.indexOf('## Common Patterns');
    return REFERENCE_DOCUMENT.substring(start, end);
  }

  if (topicLower.includes('defrost') || topicLower.includes('pattern')) {
    const start = REFERENCE_DOCUMENT.indexOf('## Common Patterns');
    const end = REFERENCE_DOCUMENT.indexOf('## Analysis Guidelines');
    return REFERENCE_DOCUMENT.substring(start, end);
  }

  return REFERENCE_DOCUMENT;
}

export default REFERENCE_DOCUMENT;
