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
imei_prefix = [
    "353001", # iPhone 15
    "353002", # iPhone 15 Pro
    "351005", # Galaxy S23
    "352001", # Pixel 7
    "352101"  # Pixel 8
]

verbose = False
mode = None

# Serial global vars
TTY = '/dev/ttyUSB3'
BAUDRATE = 9600
TIMEOUT = 3

def luhn_check(imei):
    sum_val = 0
    num_digits = len(imei)
    oddeven = num_digits & 1

    for i in range(num_digits):
        digit = int(imei[i])
        # Double every second digit if index parity matches
        if not ((i & 1) ^ oddeven):
            digit *= 2
        if digit > 9:
            digit -= 9
        sum_val += digit

    return (10 - (sum_val % 10)) % 10

def generate_imei(imei_prefix, imsi_d=None):
    if mode == Modes.DETERMINISTIC and imsi_d is not None:
        random.seed(imsi_d)

    # Pick one of the updated TACs
    imei = random.choice(imei_prefix)

    # Fill up to 14 digits total
    random_part_length = imei_length - len(imei)
    imei += "".join(random.sample(string.digits, random_part_length))

    # Compute the final check digit via new Luhn
    validation_digit = luhn_check(imei)
    imei = str(imei) + str(validation_digit)

    return imei

def validate_imei(imei):
    # Now we expect 14 base digits, with a final digit for check
    # (Still references length == 14, which you can adapt if needed)
    if len(imei) != 14:
        return False

    validation_digit = int(imei[-1])
    imei_verify = imei[0:14]
    validation_digit_verify = luhn_check(imei_verify)
    return validation_digit == validation_digit_verify

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
        imei = generate_imei(imei_prefix, imsi_d if mode == Modes.DETERMINISTIC else None)
        if (verbose):
            print(f"Generated new IMEI: {imei}")
        if not args.generate_only:
            if not set_imei(imei):
                exit(-1)

    exit(0)
