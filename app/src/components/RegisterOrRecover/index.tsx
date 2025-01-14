import { useNavigate } from "react-router"
import styled from "styled-components"
import * as Colors from "../../constants/colors"
import { init, receive_message } from "test-zk-chat-client"
import { useDispatch } from "react-redux"
import {
  addMessageToRoomAction,
  getRoomsAction
} from "../../redux/actions/actionCreator"
import { serverUrl, socketUrl } from "../../constants/constants"
import { generateProof } from "../../util/util";
import { getIdentityCommitment } from "../../util/request-passport-client"

const StyledRegisterWrapper = styled.div`
  background: ${Colors.ANATRACITE};
  height: 100%;
  display: flex;
  align-items: center;
`

const StyledButtonsContainer = styled.div`
  margin: 0 auto;
  min-width: 400px;
  border-radius: 27px;
  display: flex;
  flex-direction: column;
`

const StyledRButton = styled.button`
  background: ${(props) => props.color};
  border-radius: 8px;
  border: none;
  outline: none;
  padding: 8px 12px;
  margin: 8px;
  color: ${Colors.ANATRACITE};
  &:hover {
    transition: 0.15s;
    box-shadow: 0px 0px 15px 0px ${(props) => props.color};
  }
`

const RegisterOrRecover = () => {
  const navigate = useNavigate()
  const dispatch = useDispatch()

  const handleRegisterClick = () => {
    initializeApp()
  }

  const initializeApp = async () => {
    try {
      const identityCommitment = await getActiveIdentity()
      await init(
        {
          serverUrl,
          socketUrl
        },
        generateProof,
        identityCommitment
      )
        .then(() => {
          navigate("/dashboard")
          dispatch(getRoomsAction())
          // No need to sync the message history on Register, because the user doesn't have any room
        })
        .then(async () => {
          await receive_message(receiveMessageCallback)
        })
    } catch (error) {
      console.log("!@# RegisterOrRecover/index.tsx: error when registering, error=", error);
      navigate("/r-procedure")
    }
  }

  const getActiveIdentity = async () => {
    console.info("getting the identity from Zuzalu Passport")
    const identityCommitment = await getIdentityCommitment();
    console.log("!@# identityCommitment = ", identityCommitment);
    if (!identityCommitment) {
      throw new Error("failed to get the identity from Zuzalu Passport")
    }
    return identityCommitment.claim.identityCommitment;
  }

  const receiveMessageCallback = (message: any, roomId: string) => {
    dispatch(addMessageToRoomAction(message, roomId))
  }

  return (
    <StyledRegisterWrapper>
      <StyledButtonsContainer>
        <StyledRButton color={Colors.DARK_YELLOW} onClick={handleRegisterClick}>
          Login
        </StyledRButton>
      </StyledButtonsContainer>
    </StyledRegisterWrapper>
  )
}

export default RegisterOrRecover
