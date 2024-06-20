import React, {useContext, useEffect, useState} from 'react';
import {Text, View} from 'react-native';
import styles from '../Style';
import EndCall from './Local/EndCall';
import LocalAudioMute from './Local/LocalAudioMute';
import LocalVideoMute from './Local/LocalVideoMute';
import PropsContext, {
  ToggleState,
  UidInterface,
} from '../Contexts/PropsContext';
import {ClientRoleType, IRtcEngine} from 'react-native-agora';
import {LocalContext, RtcContext} from '../../Contexts';
import {DispatchType} from '../Contexts/RtcContext';

interface ControlsPropsInterface {
  showButton?: boolean;
}

const Controls: React.FC<ControlsPropsInterface> = (props) => {
  const {styleProps, rtcProps} = useContext(PropsContext);
  const {RtcEngine, dispatch} = useContext(RtcContext);
  const {localBtnContainer} = styleProps || {};
  const local = useContext(LocalContext);

  const [networkQuality, setNetworkQuality] = useState<string>('Невідомо');

  const qualityMessages = {
    0: 'Якість мережі невідома.',
    1: 'Якість мережі чудова.',
    2: 'Якість мережі досить добра, але бітрейт може бути трохи нижчим за відмінний.',
    3: 'Користувачі можуть відчути, що зв’язок трохи погіршений.',
    4: 'Користувачі не можуть безперебійно спілкуватися.',
    5: 'Якість настільки погана, що користувачі ледь можуть спілкуватися.',
    6: 'Мережа не працює, і користувачі взагалі не можуть спілкуватися.',
    7: 'Користувачі не можуть визначити якість мережі.',
    8: 'Виявлення якості мережі.',
  };

  useEffect(() => {
    RtcEngine.addListener('onNetworkQuality', (uid, txQuality, rxQuality) => {
      setNetworkQuality(qualityMessages[rxQuality] || 'Невідомо');

      if (rxQuality > 3) {
        muteVideo(local, dispatch, RtcEngine);
      }
    });

    return () => {
      RtcEngine.removeAllListeners('onNetworkQuality');
    };
  }, []);

  return (
    <>
      <View style={styles.networkQualityContainer}>
        <Text style={styles.networkQualityText}>{networkQuality}</Text>
      </View>
      <View style={{...styles.Controls, ...(localBtnContainer as object)}}>
        {rtcProps.role !== ClientRoleType.ClientRoleAudience && (
          <>
            <LocalAudioMute />
            <LocalVideoMute />
          </>
        )}
        <EndCall />
      </View>
    </>
  );
};

export const muteVideo = async (
  local: UidInterface,
  dispatch: DispatchType,
  RtcEngine: IRtcEngine,
) => {
  const localState = local.video;
  // Don't do anything if it is in a transitional state
  if (
    localState === ToggleState.enabled ||
    localState === ToggleState.disabled
  ) {
    // Disable UI
    dispatch({
      type: 'LocalMuteVideo',
      value: [
        localState === ToggleState.enabled
          ? ToggleState.disabling
          : ToggleState.enabling,
      ],
    });

    try {
      await RtcEngine.muteLocalVideoStream(localState === ToggleState.enabled);
      // Enable UI
      dispatch({
        type: 'LocalMuteVideo',
        value: [
          localState === ToggleState.enabled
            ? ToggleState.disabled
            : ToggleState.enabled,
        ],
      });
    } catch (e) {
      console.error(e);
      dispatch({
        type: 'LocalMuteVideo',
        value: [localState],
      });
    }
  } else {
    console.log('LocalMuteVideo in transition', local, ToggleState);
  }
};

export default Controls;
