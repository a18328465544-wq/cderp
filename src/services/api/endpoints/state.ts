import {adaptPublicState} from "../adapters/state.adapter";
import type {PublicStateResponseDto} from "../dto/state.dto";
import {fetchInitialStateCompat} from "../state-compat";

export const stateApi = {
  async initial(signal?: AbortSignal) {
    const response = await fetchInitialStateCompat<PublicStateResponseDto>(signal);
    return adaptPublicState(response);
  },
};
