#!/usr/bin/env python3
import random
import string
import argparse
import serial
import re
from functools import reduce
from enum import Enum


class Modes(Enum):
    DETERMINISTIC = 1
    RANDOM = 2
    STATIC = 3


ap = argparse.ArgumentParser()
ap.add_argument("-v", "--verbose", help="Enables verbose output",
                action="store_true")
ap.add_argument("-g", "--generate-only", help="Only generates an IMEI rather than setting it",
                   action="store_true")
modes = ap.add_mutually_exclusive_group()
modes.add_argument("-d", "--deterministic", help="Switches IMEI generation to deterministic mode", action="store_true")
modes.add_argument("-s", "--static", help="Sets user-defined IMEI",
                   action="store")
modes.add_argument("-r", "--random", help="Sets random IMEI",
                   action="store_true")

# Example IMEI: 490154203237518
imei_length = 14  # without validation digit
# IDEA: make prefix configurable via CLI option
imei_prefix = ["35674108", "35290611", "35397710", "35323210", "35384110",
               "35982748", "35672011", "35759049", "35266891", "35407115",
               "35538025", "35480910", "35324590", "35901183", "35139729",
               "35479164"]

verbose = False
mode = None

# Serial global vars
TTY = '/dev/ttyUSB3'
BAUDRATE = 9600
TIMEOUT = 3


def get_imsi():
    if (verbose):
        print(f'Obtaining Serial {TTY} with timeout {TIMEOUT}...')
    with serial.Serial(TTY, BAUDRATE, timeout=TIMEOUT, exclusive=True) as ser:
        if (verbose):
            print('Getting IMSI')
        ser.write(b'AT+CIMI\r')
        # TODO: read loop until we have 'enough' of what to expect
        output = ser.read(64)

    if (verbose):
        print(b'Output of AT+CIMI (Retrieve IMSI) command: ' + output)
        print('Output is of type: ' + str(type(output)))
    imsi_d = re.findall(b'[0-9]{15}', output)
    if (verbose):
        print("TEST: Read IMSI is", imsi_d)

    return b"".join(imsi_d)


def set_imei(imei):
    with serial.Serial(TTY, BAUDRATE, timeout=TIMEOUT, exclusive=True) as ser:
        cmd = b'AT+EGMR=1,7,\"'+imei.encode()+b'\"\r'
        ser.write(cmd)
        output = ser.read(64)

    if (verbose):
        print(cmd)
        print(b'Output of AT+EGMR (Set IMEI) command: ' + output)
        print('Output is of type: ' + str(type(output)))

    new_imei = get_imei()
    if (verbose):
        print(b"New IMEI: "+new_imei+b" Old IMEI: "+imei.encode())

    if new_imei == imei.encode():
        print("IMEI has been successfully changed.")
        return True
    else:
        print("IMEI has not been successfully changed.")
        return False


def get_imei():
    with serial.Serial(TTY, BAUDRATE, timeout=TIMEOUT, exclusive=True) as ser:
        ser.write(b'AT+GSN\r')
        output = ser.read(64)

    if (verbose):
        print(b'Output of AT+GSN (Retrieve IMEI) command: ' + output)
        print('Output is of type: ' + str(type(output)))
    imei_d = re.findall(b'[0-9]{15}', output)
    if (verbose):
        print("TEST: Read IMEI is", imei_d)

    return b"".join(imei_d)


def generate_imei(imei_prefix, imsi_d):
    # In deterministic mode we seed the RNG with the IMSI.
    # As a consequence we will always generate the same IMEI for a given IMSI
    if (mode == Modes.DETERMINISTIC):
        random.seed(imsi_d)

    # We choose a random prefix from the predefined list.
    # Then we fill the rest with random characters
    imei = random.choice(imei_prefix)
    if (verbose):
        print(f"IMEI prefix: {imei}")
    random_part_length = imei_length - len(imei)
    if (verbose):
        print(f"Length of the random IMEI part: {random_part_length}")
    imei += "".join(random.sample(string.digits, random_part_length))
    if (verbose):
        print(f"IMEI without validation digit: {imei}")

    # calculate validation digit
    # Double each second digit in the IMEI: 4 18 0 2 5 8 2 0 3 4 3 14 5 2
    # (excluding the validation digit)

    iteration_1 = "".join([c if i % 2 == 0 else str(2*int(c)) for i, c in enumerate(imei)])

    # Separate this number into single digits: 4 1 8 0 2 5 8 2 0 3 4 3 1 4 5 2
    # (notice that 18 and 14 have been split).
    # Add up all the numbers: 4+1+8+0+2+5+8+2+0+3+4+3+1+4+5+2 = 52

    sum = reduce((lambda a, b: int(a) + int(b)), iteration_1)

    # Take your resulting number, remember it, and round it up to the nearest
    # multiple of ten: 60.
    # Subtract your original number from the rounded-up number: 60 - 52 = 8.

    validation_digit = (10 - int(str(sum)[-1])) % 10
    if (verbose):
        print(f"Validation digit: {validation_digit}")

    imei = str(imei) + str(validation_digit)
    if (verbose):
        print(f"Resulting IMEI: {imei}")

    return imei


def validate_imei(imei):
    # before anything check if length is 14 characters
    if len(imei) != 14:
        print(f"NOT A VALID IMEI: {imei} - IMEI must be 14 characters in length")
        return False
    # cut off last digit
    validation_digit = int(imei[-1])
    imei_verify = imei[0:14]
    if (verbose):
        print(imei_verify)

    # Double each second digit in the IMEI
    iteration_1 = "".join([c if i % 2 == 0 else str(2*int(c)) for i, c in enumerate(imei_verify)])

    # Separate this number into single digits and add them up
    sum = reduce((lambda a, b: int(a) + int(b)), iteration_1)
    if (verbose):
        print(sum)

    # Take your resulting number, remember it, and round it up to the nearest
    # multiple of ten.
    # Subtract your original number from the rounded-up number.
    validation_digit_verify = (10 - int(str(sum)[-1])) % 10
    if (verbose):
        print(validation_digit_verify)

    if validation_digit == validation_digit_verify:
        print(f"{imei} is CORRECT")
        return True

    print(f"NOT A VALID IMEI: {imei}")
    return False


if __name__ == '__main__':
    args = ap.parse_args()
    imsi_d = None
    if args.verbose:
        verbose = args.verbose
    if args.deterministic:
        mode = Modes.DETERMINISTIC
        imsi_d = get_imsi()
    if args.random:
        mode = Modes.RANDOM
    if args.static is not None:
        mode = Modes.STATIC
        static_imei = args.static

    if mode == Modes.STATIC:
        if validate_imei(static_imei):
            set_imei(static_imei)
        else:
            exit(-1)
    else:
        imei = generate_imei(imei_prefix, imsi_d)
        if (verbose):
            print(f"Generated new IMEI: {imei}")
        if not args.generate_only:
            if not set_imei(imei):
                exit(-1)

    exit(0)
