import React, {
  useState,
  useReducer,
  useContext,
  useCallback,
  useRef,
  PropsWithChildren,
} from 'react';
import {
  RtcProvider,
  UidStateInterface,
  DispatchType,
  ActionType,
} from './Contexts/RtcContext';
import PropsContext, {
  ToggleState,
  UidInterface,
  RtcPropsInterface,
  CallbacksInterface,
  DualStreamMode,
} from './Contexts/PropsContext';
import {MinUidProvider} from './Contexts/MinUidContext';
import {MaxUidProvider} from './Contexts/MaxUidContext';
import {actionTypeGuard} from './Utils/actionTypeGuard';
import {
  BecomeAudience,
  LocalMuteAudio,
  LocalMuteVideo,
  RemoteAudioStateChanged,
  RemoteVideoStateChanged,
  UpdateDualStreamMode,
  UserJoined,
  UserMuteRemoteAudio,
  UserMuteRemoteVideo,
  UserOffline,
} from './Reducer';
import Create from './Rtc/Create';
import Join from './Rtc/Join';
import {
  BackgroundSourceType,
  ClientRoleType,
  VideoMirrorModeType,
} from 'react-native-agora';
import RNFetchBlob from 'rn-fetch-blob';
import RNFS from 'react-native-fs';

const RtcConfigure: React.FC<PropsWithChildren<Partial<RtcPropsInterface>>> = (
  props,
) => {
  const {callbacks, rtcProps} = useContext(PropsContext);
  const rtcUidRef = useRef<number>();
  const [rtcChannelJoined, setRtcChannelJoined] = useState(false);
  let [dualStreamMode, setDualStreamMode] = useState<DualStreamMode>(
    rtcProps?.initialDualStreamMode || DualStreamMode.DYNAMIC,
  );

  const initialLocalState: UidStateInterface = {
    min: [],
    max: [
      {
        // todo: fix enum
        uid: 'local',
        audio:
          // eslint-disable-next-line eqeqeq
          rtcProps.mode == 1 &&
          rtcProps.role &&
          // eslint-disable-next-line eqeqeq
          rtcProps.role == ClientRoleType.ClientRoleAudience
            ? ToggleState.disabled
            : ToggleState.enabled,
        video:
          // eslint-disable-next-line eqeqeq
          rtcProps.mode == 1 &&
          rtcProps.role &&
          // eslint-disable-next-line eqeqeq
          rtcProps.role == ClientRoleType.ClientRoleAudience
            ? ToggleState.disabled
            : ToggleState.enabled,
        streamType: 'high',
      },
    ],
  };

  const [initialState, setInitialState] = React.useState(
    JSON.parse(JSON.stringify(initialLocalState)),
  );

  React.useEffect(() => {
    setInitialState(JSON.parse(JSON.stringify(initialLocalState)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reducer = (
    state: UidStateInterface,
    action: ActionType<keyof CallbacksInterface>,
  ) => {
    let stateUpdate = {},
      uids = [...state.max, ...state.min].map((u: UidInterface) => u.uid);

    switch (action.type) {
      case 'UpdateDualStreamMode':
        if (actionTypeGuard(action, action.type)) {
          stateUpdate = UpdateDualStreamMode(state, action);
        }
        break;
      case 'UserJoined':
        if (actionTypeGuard(action, action.type)) {
          stateUpdate = UserJoined(state, action, dualStreamMode, uids);
        }
        break;
      case 'UserOffline':
        if (actionTypeGuard(action, action.type)) {
          stateUpdate = UserOffline(state, action);
        }
        break;
      case 'SwapVideo':
        if (actionTypeGuard(action, action.type)) {
          stateUpdate = swapVideo(state, action.value[0]);
        }
        break;
      case 'ActiveSpeaker':
        if (actionTypeGuard(action, action.type)) {
          stateUpdate = ActiveSpeaker(state, action.value[0]);
        }
        break;
      case 'UserMuteRemoteAudio':
        if (actionTypeGuard(action, action.type)) {
          stateUpdate = UserMuteRemoteAudio(state, action);
        }
        break;
      case 'UserMuteRemoteVideo':
        if (actionTypeGuard(action, action.type)) {
          stateUpdate = UserMuteRemoteVideo(state, action);
        }
        break;
      case 'LocalMuteAudio':
        if (actionTypeGuard(action, action.type)) {
          stateUpdate = LocalMuteAudio(state, action);
        }
        break;
      case 'LocalMuteVideo':
        if (actionTypeGuard(action, action.type)) {
          stateUpdate = LocalMuteVideo(state, action);
        }
        break;
      case 'RemoteAudioStateChanged':
        if (actionTypeGuard(action, action.type)) {
          stateUpdate = RemoteAudioStateChanged(state, action);
        }
        break;
      case 'RemoteVideoStateChanged':
        if (actionTypeGuard(action, action.type)) {
          stateUpdate = RemoteVideoStateChanged(state, action);
        }
        break;
      case 'BecomeAudience':
        if (actionTypeGuard(action, action.type)) {
          stateUpdate = BecomeAudience(state);
        }
        break;
    }

    // TODO: remove Handle event listeners

    if (callbacks && callbacks[action.type]) {
      // @ts-ignore
      callbacks[action.type].apply(null, action.value);
      console.log('callback executed');
    } else {
      // console.log('callback not found', action.type);
    }

    // console.log(state, action, stateUpdate);

    return {
      ...state,
      ...stateUpdate,
    };
  };

  const swapVideo = useCallback(
    (state: UidStateInterface, ele: UidInterface) => {
      let newState: UidStateInterface = {
        min: [],
        max: [],
      };
      // Remove the minimized element which is being swapped out
      newState.min = state.min.filter((e) => e !== ele);

      let maxEle = state.max[0]; // Element which is currently maximized
      let minEle = ele;

      if (dualStreamMode === DualStreamMode.DYNAMIC) {
        maxEle.streamType = 'low'; // set stream quality to low
        minEle.streamType = 'high'; // set stream quality to high

        // No need to modify the streamType if the mode is not dynamic
      }

      if (maxEle.uid === 'local') {
        newState.min.unshift(maxEle);
      } else {
        newState.min.push(maxEle);
      }
      newState.max = [minEle];

      return newState;
    },
    [dualStreamMode],
  );

  const ActiveSpeaker = (state: UidStateInterface, uid: number | string) => {
    let ele = state.min.find((e) => e.uid === uid);
    if (ele) {
      return swapVideo(state, ele);
    } else {
      return state;
    }
  };

  const [uidState, dispatch]: [UidStateInterface, DispatchType] = useReducer(
    reducer,
    initialState,
  );

  return (
    <Create
      dispatch={dispatch}
      rtcUidRef={rtcUidRef}
      setRtcChannelJoined={setRtcChannelJoined}>
      {(engineRef, joinState) => {
        const imageSource =
          'https://firebasestorage.googleapis.com/v0/b/medatlant.appspot.com/o/backgroundCallNew.jpg?alt=media&token=abdd8169-2165-4fe6-947b-b4c17d4c6999';
        const imagePath = `${RNFS.DocumentDirectoryPath}/BackgroundCall.jpg`;

        RNFetchBlob.config({
          fileCache: true,
          path: imagePath,
        })
          .fetch('GET', imageSource)
          .then((value) => {
            engineRef.current.enableVirtualBackground(
              true,
              {
                background_source_type: BackgroundSourceType.BackgroundImg,
                source: value.data,
              },
              {},
            );
          })
          .catch((err) => {
            console.log(err.message, err.code);
          });

        engineRef.current.setLocalVideoMirrorMode(
          VideoMirrorModeType.VideoMirrorModeDisabled,
        );

        return (
          <Join
            precall={rtcProps.callActive === false}
            engineRef={engineRef}
            uidState={uidState}
            joinState={joinState}
            dispatch={dispatch}>
            <RtcProvider
              value={{
                RtcEngine: engineRef.current,
                rtcUidRef,
                rtcChannelJoined,
                dispatch,
                setDualStreamMode,
              }}>
              <MaxUidProvider value={uidState.max}>
                <MinUidProvider value={uidState.min}>
                  {rtcChannelJoined ? props.children : <React.Fragment />}
                </MinUidProvider>
              </MaxUidProvider>
            </RtcProvider>
          </Join>
        );
      }}
    </Create>
  );
};

export default RtcConfigure;
