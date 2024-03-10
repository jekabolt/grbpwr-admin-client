import { Dispatch, FC, ReactNode, createContext, useReducer } from 'react';

const initialContexValue = {};

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface IState {}
type ActionsType = '';

const reducer = (state: IState, action: { type: ActionsType; payload: string }) => {
  switch (action.type) {
    case '':
    default:
      return state;
  }
};

interface IContextValue {
  state: IState;
  dispatch: Dispatch<{ type: ActionsType; payload: string }>;
}
export const Context = createContext<IContextValue>({
  state: initialContexValue,
  dispatch: () => null,
});

export const ContextProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, initialContexValue);

  return <Context.Provider value={{ state, dispatch }}>{children}</Context.Provider>;
};
